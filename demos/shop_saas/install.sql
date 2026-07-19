-- =============================================================================
-- 小店 SaaS 完整多页面 Demo（1.x 积木：单表 + SQL 仓库 + 事务动作 + openQuery 钻取）
-- 非 2.0 主副表：销售/采购用「明细行台账」模拟，一单多行用 order_no 关联查看。
--
--   docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/shop_saas/install.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Clean previous shop demo metadata (keep other demos if any)
-- ---------------------------------------------------------------------------
DELETE FROM lc_page_model WHERE page_code LIKE 'shop_%';
DELETE FROM lc_action WHERE action_code LIKE 'shop_%';
DELETE FROM lc_query_model WHERE query_code LIKE 'q_shop_%' OR query_code LIKE 'sql_shop_%';
DELETE FROM lc_entity_model WHERE entity_code LIKE 'entity_shop_%';

DROP TABLE IF EXISTS shop_sale_line CASCADE;
DROP TABLE IF EXISTS shop_purchase_line CASCADE;
DROP TABLE IF EXISTS shop_stock_move CASCADE;
DROP TABLE IF EXISTS shop_product CASCADE;
DROP TABLE IF EXISTS shop_customer CASCADE;
DROP TABLE IF EXISTS shop_supplier CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Business tables
-- ---------------------------------------------------------------------------
CREATE TABLE shop_supplier (
    id            BIGSERIAL PRIMARY KEY,
    supplier_code VARCHAR(50)  NOT NULL UNIQUE,
    supplier_name VARCHAR(100) NOT NULL,
    phone         VARCHAR(50),
    status        INTEGER      NOT NULL DEFAULT 1,
    remark        TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE shop_customer (
    id            BIGSERIAL PRIMARY KEY,
    customer_code VARCHAR(50)  NOT NULL UNIQUE,
    customer_name VARCHAR(100) NOT NULL,
    phone         VARCHAR(50),
    status        INTEGER      NOT NULL DEFAULT 1,
    remark        TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE shop_product (
    id            BIGSERIAL PRIMARY KEY,
    sku           VARCHAR(50)  NOT NULL UNIQUE,
    name          VARCHAR(200) NOT NULL,
    category      VARCHAR(100) NOT NULL DEFAULT 'General',
    unit          VARCHAR(20)  NOT NULL DEFAULT 'pcs',
    cost_price    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sale_price    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    qty_on_hand   NUMERIC(12, 2) NOT NULL DEFAULT 0,
    safety_qty    NUMERIC(12, 2) NOT NULL DEFAULT 5,
    status        INTEGER      NOT NULL DEFAULT 1,
    remark        TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE shop_stock_move (
    move_id     BIGSERIAL PRIMARY KEY,
    sku         VARCHAR(50) NOT NULL REFERENCES shop_product(sku),
    move_type   VARCHAR(20) NOT NULL,  -- IN / OUT / ADJ
    qty         NUMERIC(12, 2) NOT NULL,
    ref_no      VARCHAR(50),
    remark      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 采购明细行（无头表；同 purchase_no 视为同一采购单）
CREATE TABLE shop_purchase_line (
    id             BIGSERIAL PRIMARY KEY,
    purchase_no    VARCHAR(50) NOT NULL,
    supplier_code  VARCHAR(50) NOT NULL REFERENCES shop_supplier(supplier_code),
    sku            VARCHAR(50) NOT NULL REFERENCES shop_product(sku),
    qty            NUMERIC(12, 2) NOT NULL,
    unit_cost      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    amount         NUMERIC(12, 2) GENERATED ALWAYS AS (qty * unit_cost) STORED,
    status         INTEGER NOT NULL DEFAULT 0,  -- 0 草稿 1 已入库
    purchase_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    remark         TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 销售明细行（无头表；同 sale_no 视为同一销售单）
CREATE TABLE shop_sale_line (
    id            BIGSERIAL PRIMARY KEY,
    sale_no       VARCHAR(50) NOT NULL,
    customer_code VARCHAR(50) NOT NULL REFERENCES shop_customer(customer_code),
    sku           VARCHAR(50) NOT NULL REFERENCES shop_product(sku),
    qty           NUMERIC(12, 2) NOT NULL,
    unit_price    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    amount        NUMERIC(12, 2) GENERATED ALWAYS AS (qty * unit_price) STORED,
    status        INTEGER NOT NULL DEFAULT 0,  -- 0 草稿 1 已出库
    sale_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    remark        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Seed data
-- ---------------------------------------------------------------------------
INSERT INTO shop_supplier (supplier_code, supplier_name, phone, status) VALUES
('S_APPLE',  '苹果供应链', '13800000001', 1),
('S_LOCAL',  '本地批发部', '13800000002', 1),
('S_SNACK',  '零食批发',   '13800000003', 1);

INSERT INTO shop_customer (customer_code, customer_name, phone, status) VALUES
('C_WALKIN', '散客',       '',            1),
('C_ALICE',  'Alice 小店', '13900000001', 1),
('C_BOB',    'Bob 食堂',   '13900000002', 1),
('C_CAFE',   '街角咖啡馆', '13900000003', 1);

INSERT INTO shop_product (sku, name, category, unit, cost_price, sale_price, qty_on_hand, safety_qty, status, remark) VALUES
('SKU-COLA-330',  '可乐 330ml',     '饮料', '听', 1.20,  3.50,  80, 30, 1, '畅销'),
('SKU-WATER-550', '矿泉水 550ml',   '饮料', '瓶', 0.40,  1.50,   6, 20, 1, '低于安全库存'),
('SKU-CHIPS',     '薯片大包装',     '零食', '袋', 4.00,  9.90,  40, 15, 1, NULL),
('SKU-RICE-5KG',  '大米 5kg',       '主食', '袋', 18.00, 29.90, 12, 10, 1, NULL),
('SKU-NOODLE',    '方便面整箱',     '主食', '箱', 28.00, 45.00,  8,  8, 1, '临界'),
('SKU-OLD-TEA',   '停售花茶',       '饮料', '盒', 8.00,  15.00,  0,  5, 0, '已停用');

INSERT INTO shop_stock_move (sku, move_type, qty, ref_no, remark, created_at) VALUES
('SKU-COLA-330',  'IN',  100, 'PO-DEMO-01', '期初/采购', NOW() - INTERVAL '14 days'),
('SKU-COLA-330',  'OUT', -20, 'SO-DEMO-01', '销售',     NOW() - INTERVAL '10 days'),
('SKU-WATER-550', 'IN',   50, 'PO-DEMO-01', '采购',     NOW() - INTERVAL '12 days'),
('SKU-WATER-550', 'OUT', -44, 'SO-DEMO-02', '销售',     NOW() - INTERVAL '2 days'),
('SKU-CHIPS',     'IN',   50, 'PO-DEMO-02', '采购',     NOW() - INTERVAL '7 days'),
('SKU-CHIPS',     'OUT', -10, 'SO-DEMO-03', '销售',     NOW() - INTERVAL '1 days'),
('SKU-RICE-5KG',  'IN',   20, 'PO-DEMO-02', '采购',     NOW() - INTERVAL '6 days'),
('SKU-RICE-5KG',  'OUT',  -8, 'SO-DEMO-04', '销售',     NOW() - INTERVAL '1 days'),
('SKU-NOODLE',    'IN',   10, 'PO-DEMO-03', '采购',     NOW() - INTERVAL '5 days'),
('SKU-NOODLE',    'OUT',  -2, 'SO-DEMO-05', '销售',     NOW() - INTERVAL '1 days');

INSERT INTO shop_purchase_line (purchase_no, supplier_code, sku, qty, unit_cost, status, purchase_date, remark) VALUES
('PO-2026-001', 'S_LOCAL', 'SKU-COLA-330',  50, 1.15, 1, CURRENT_DATE - 14, '已入库'),
('PO-2026-001', 'S_LOCAL', 'SKU-WATER-550', 50, 0.38, 1, CURRENT_DATE - 14, '已入库'),
('PO-2026-002', 'S_SNACK', 'SKU-CHIPS',     30, 3.80, 1, CURRENT_DATE - 7,  '已入库'),
('PO-2026-003', 'S_APPLE', 'SKU-RICE-5KG',  10, 17.50, 0, CURRENT_DATE - 1, '草稿待入库'),
('PO-2026-003', 'S_APPLE', 'SKU-NOODLE',     5, 27.00, 0, CURRENT_DATE - 1, '草稿待入库');

INSERT INTO shop_sale_line (sale_no, customer_code, sku, qty, unit_price, status, sale_date, remark) VALUES
('SO-2026-001', 'C_ALICE',  'SKU-COLA-330',  10, 3.50, 1, CURRENT_DATE - 10, '已出库'),
('SO-2026-001', 'C_ALICE',  'SKU-CHIPS',      2, 9.90, 1, CURRENT_DATE - 10, '已出库'),
('SO-2026-002', 'C_WALKIN', 'SKU-WATER-550',  6, 1.50, 1, CURRENT_DATE - 2,  '已出库'),
('SO-2026-003', 'C_CAFE',   'SKU-COLA-330',  12, 3.20, 0, CURRENT_DATE,      '草稿待出库'),
('SO-2026-003', 'C_CAFE',   'SKU-NOODLE',     1, 45.00, 0, CURRENT_DATE,     '草稿待出库'),
('SO-2026-004', 'C_BOB',    'SKU-RICE-5KG',   2, 29.90, 0, CURRENT_DATE,     '草稿');

-- ---------------------------------------------------------------------------
-- 3. Entities
-- ---------------------------------------------------------------------------
INSERT INTO lc_entity_model (entity_code, table_name, primary_key, label_field, fields_json) VALUES
('entity_shop_supplier', 'shop_supplier', 'id', 'supplier_name',
 '[{"field":"id","label":"ID","type":"integer"},{"field":"supplier_code","label":"编码","type":"string"},{"field":"supplier_name","label":"名称","type":"string"},{"field":"phone","label":"电话","type":"string"},{"field":"status","label":"状态","type":"integer"},{"field":"remark","label":"备注","type":"string"},{"field":"created_at","label":"创建","type":"datetime"}]'::jsonb),
('entity_shop_customer', 'shop_customer', 'id', 'customer_name',
 '[{"field":"id","label":"ID","type":"integer"},{"field":"customer_code","label":"编码","type":"string"},{"field":"customer_name","label":"名称","type":"string"},{"field":"phone","label":"电话","type":"string"},{"field":"status","label":"状态","type":"integer"},{"field":"remark","label":"备注","type":"string"},{"field":"created_at","label":"创建","type":"datetime"}]'::jsonb),
('entity_shop_product', 'shop_product', 'id', 'name',
 '[{"field":"id","label":"ID","type":"integer"},{"field":"sku","label":"货号","type":"string"},{"field":"name","label":"名称","type":"string"},{"field":"category","label":"分类","type":"string"},{"field":"unit","label":"单位","type":"string"},{"field":"cost_price","label":"进价","type":"number"},{"field":"sale_price","label":"售价","type":"number"},{"field":"qty_on_hand","label":"库存","type":"number"},{"field":"safety_qty","label":"安全库存","type":"number"},{"field":"status","label":"状态","type":"integer"},{"field":"remark","label":"备注","type":"string"},{"field":"updated_at","label":"更新","type":"datetime"}]'::jsonb),
('entity_shop_stock_move', 'shop_stock_move', 'move_id', 'ref_no',
 '[{"field":"move_id","label":"ID","type":"integer"},{"field":"sku","label":"货号","type":"string"},{"field":"move_type","label":"类型","type":"string"},{"field":"qty","label":"数量","type":"number"},{"field":"ref_no","label":"单号","type":"string"},{"field":"remark","label":"备注","type":"string"},{"field":"created_at","label":"时间","type":"datetime"}]'::jsonb),
('entity_shop_purchase', 'shop_purchase_line', 'id', 'purchase_no',
 '[{"field":"id","label":"ID","type":"integer"},{"field":"purchase_no","label":"采购单号","type":"string"},{"field":"supplier_code","label":"供应商","type":"string"},{"field":"sku","label":"货号","type":"string"},{"field":"qty","label":"数量","type":"number"},{"field":"unit_cost","label":"单价","type":"number"},{"field":"amount","label":"金额","type":"number"},{"field":"status","label":"状态","type":"integer"},{"field":"purchase_date","label":"日期","type":"datetime"},{"field":"remark","label":"备注","type":"string"}]'::jsonb),
('entity_shop_sale', 'shop_sale_line', 'id', 'sale_no',
 '[{"field":"id","label":"ID","type":"integer"},{"field":"sale_no","label":"销售单号","type":"string"},{"field":"customer_code","label":"客户","type":"string"},{"field":"sku","label":"货号","type":"string"},{"field":"qty","label":"数量","type":"number"},{"field":"unit_price","label":"单价","type":"number"},{"field":"amount","label":"金额","type":"number"},{"field":"status","label":"状态","type":"integer"},{"field":"sale_date","label":"日期","type":"datetime"},{"field":"remark","label":"备注","type":"string"}]'::jsonb);

-- ---------------------------------------------------------------------------
-- 4. SQL repo assets (queries + dml for actions)
-- ---------------------------------------------------------------------------
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode) VALUES
-- page lists
('q_shop_suppliers', 'entity_shop_supplier',
 'SELECT id, supplier_code, supplier_name, phone, status, remark, created_at FROM shop_supplier',
 'singleTableTemplate'),
('q_shop_customers', 'entity_shop_customer',
 'SELECT id, customer_code, customer_name, phone, status, remark, created_at FROM shop_customer',
 'singleTableTemplate'),
('q_shop_products', 'entity_shop_product',
 'SELECT id, sku, name, category, unit, cost_price, sale_price, qty_on_hand, safety_qty, status, remark, updated_at FROM shop_product',
 'singleTableTemplate'),
('q_shop_stock_moves', 'entity_shop_stock_move',
 'SELECT move_id, sku, move_type, qty, ref_no, remark, created_at FROM shop_stock_move',
 'singleTableTemplate'),
('q_shop_purchases', 'entity_shop_purchase',
 'SELECT id, purchase_no, supplier_code, sku, qty, unit_cost, amount, status, purchase_date, remark, created_at FROM shop_purchase_line',
 'singleTableTemplate'),
('q_shop_sales', 'entity_shop_sale',
 'SELECT id, sale_no, customer_code, sku, qty, unit_price, amount, status, sale_date, remark, created_at FROM shop_sale_line',
 'singleTableTemplate'),
-- readonly smart views
('q_shop_low_stock', NULL,
 'SELECT id, sku, name, category, qty_on_hand, safety_qty, (safety_qty - qty_on_hand) AS shortage, sale_price, status
  FROM shop_product WHERE status = 1 AND qty_on_hand <= safety_qty ORDER BY (safety_qty - qty_on_hand) DESC',
 'rawSql'),
('q_shop_today_sales', NULL,
 'SELECT sale_no, customer_code, sku, qty, unit_price, amount, status, sale_date
  FROM shop_sale_line WHERE sale_date = CURRENT_DATE ORDER BY sale_no, id',
 'rawSql'),
-- drill-down / options
('q_shop_moves_by_sku', NULL,
 'SELECT move_id, sku, move_type, qty, ref_no, remark, created_at FROM shop_stock_move WHERE sku = :sku ORDER BY created_at DESC',
 'rawSql'),
('q_shop_sales_by_sku', NULL,
 'SELECT id, sale_no, customer_code, sku, qty, unit_price, amount, status, sale_date FROM shop_sale_line WHERE sku = :sku ORDER BY sale_date DESC, id DESC',
 'rawSql'),
('q_shop_sales_by_customer', NULL,
 'SELECT id, sale_no, customer_code, sku, qty, unit_price, amount, status, sale_date FROM shop_sale_line WHERE customer_code = :customer_code ORDER BY sale_date DESC',
 'rawSql'),
('q_shop_purchases_by_supplier', NULL,
 'SELECT id, purchase_no, supplier_code, sku, qty, unit_cost, amount, status, purchase_date FROM shop_purchase_line WHERE supplier_code = :supplier_code ORDER BY purchase_date DESC',
 'rawSql'),
('q_shop_lines_by_sale_no', NULL,
 'SELECT id, sale_no, customer_code, sku, qty, unit_price, amount, status, sale_date, remark FROM shop_sale_line WHERE sale_no = :sale_no ORDER BY id',
 'rawSql'),
('q_shop_lines_by_purchase_no', NULL,
 'SELECT id, purchase_no, supplier_code, sku, qty, unit_cost, amount, status, purchase_date, remark FROM shop_purchase_line WHERE purchase_no = :purchase_no ORDER BY id',
 'rawSql'),
('q_shop_category_options', NULL,
 'SELECT DISTINCT category AS value, category AS label FROM shop_product ORDER BY category',
 'rawSql'),
('q_shop_supplier_options', NULL,
 'SELECT supplier_code AS value, supplier_name AS label FROM shop_supplier WHERE status = 1 ORDER BY supplier_code',
 'rawSql'),
('q_shop_customer_options', NULL,
 'SELECT customer_code AS value, customer_name AS label FROM shop_customer WHERE status = 1 ORDER BY customer_code',
 'rawSql'),
('q_shop_sku_options', NULL,
 'SELECT sku AS value, (sku || '' · '' || name) AS label FROM shop_product WHERE status = 1 ORDER BY sku',
 'rawSql'),
-- action SQL assets (dml / assert)
('sql_shop_disable_product', NULL,
 'UPDATE shop_product SET status = 0, updated_at = NOW() WHERE id = :id',
 'dml'),
('sql_shop_enable_product', NULL,
 'UPDATE shop_product SET status = 1, updated_at = NOW() WHERE id = :id',
 'dml'),
('sql_shop_assert_sale_draft', NULL,
 'SELECT (status = 0) AS ok FROM shop_sale_line WHERE id = :id',
 'rawSql'),
('sql_shop_assert_stock_for_sale', NULL,
 'SELECT (p.qty_on_hand >= s.qty AND p.status = 1) AS ok
  FROM shop_sale_line s JOIN shop_product p ON p.sku = s.sku WHERE s.id = :id',
 'rawSql'),
('sql_shop_post_sale_line', NULL,
 'UPDATE shop_sale_line SET status = 1 WHERE id = :id AND status = 0',
 'dml'),
('sql_shop_post_sale_stock', NULL,
 'UPDATE shop_product p SET qty_on_hand = qty_on_hand - s.qty, updated_at = NOW()
  FROM shop_sale_line s WHERE s.id = :id AND p.sku = s.sku AND s.status = 1',
 'dml'),
('sql_shop_post_sale_move', NULL,
 'INSERT INTO shop_stock_move (sku, move_type, qty, ref_no, remark)
  SELECT s.sku, ''OUT'', -s.qty, s.sale_no, ''销售出库'' FROM shop_sale_line s WHERE s.id = :id',
 'dml'),
('sql_shop_assert_purchase_draft', NULL,
 'SELECT (status = 0) AS ok FROM shop_purchase_line WHERE id = :id',
 'rawSql'),
('sql_shop_post_purchase_line', NULL,
 'UPDATE shop_purchase_line SET status = 1 WHERE id = :id AND status = 0',
 'dml'),
('sql_shop_post_purchase_stock', NULL,
 'UPDATE shop_product p SET qty_on_hand = qty_on_hand + s.qty, updated_at = NOW()
  FROM shop_purchase_line s WHERE s.id = :id AND p.sku = s.sku AND s.status = 1',
 'dml'),
('sql_shop_post_purchase_move', NULL,
 'INSERT INTO shop_stock_move (sku, move_type, qty, ref_no, remark)
  SELECT s.sku, ''IN'', s.qty, s.purchase_no, ''采购入库'' FROM shop_purchase_line s WHERE s.id = :id',
 'dml');

-- ---------------------------------------------------------------------------
-- 5. Actions
-- ---------------------------------------------------------------------------
INSERT INTO lc_action (action_code, action_type, label, config_json, enabled) VALUES
('shop_disable_product', 'sqlTransaction', '停用商品',
 '{"type":"sqlTransaction","refresh":true,"successMessage":"商品已停用","bind":{"id":{"from":"row","field":"id","required":true}},"statements":[{"kind":"write","sqlAssetCode":"sql_shop_disable_product"}]}'::jsonb,
 true),
('shop_enable_product', 'sqlTransaction', '启用商品',
 '{"type":"sqlTransaction","refresh":true,"successMessage":"商品已启用","bind":{"id":{"from":"row","field":"id","required":true}},"statements":[{"kind":"write","sqlAssetCode":"sql_shop_enable_product"}]}'::jsonb,
 true),
('shop_post_sale_line', 'sqlTransaction', '确认出库',
 '{
   "type":"sqlTransaction","refresh":true,"successMessage":"已出库并扣减库存",
   "bind":{"id":{"from":"row","field":"id","required":true}},
   "statements":[
     {"name":"draft","kind":"assert","sqlAssetCode":"sql_shop_assert_sale_draft"},
     {"name":"stock","kind":"assert","sqlAssetCode":"sql_shop_assert_stock_for_sale"},
     {"name":"post","kind":"write","sqlAssetCode":"sql_shop_post_sale_line"},
     {"name":"qty","kind":"write","sqlAssetCode":"sql_shop_post_sale_stock"},
     {"name":"move","kind":"write","sqlAssetCode":"sql_shop_post_sale_move"}
   ]
 }'::jsonb,
 true),
('shop_post_purchase_line', 'sqlTransaction', '确认入库',
 '{
   "type":"sqlTransaction","refresh":true,"successMessage":"已入库并增加库存",
   "bind":{"id":{"from":"row","field":"id","required":true}},
   "statements":[
     {"name":"draft","kind":"assert","sqlAssetCode":"sql_shop_assert_purchase_draft"},
     {"name":"post","kind":"write","sqlAssetCode":"sql_shop_post_purchase_line"},
     {"name":"qty","kind":"write","sqlAssetCode":"sql_shop_post_purchase_stock"},
     {"name":"move","kind":"write","sqlAssetCode":"sql_shop_post_purchase_move"}
   ]
 }'::jsonb,
 true);

-- ---------------------------------------------------------------------------
-- 6. Pages (route /shop/* → 侧栏分组 Shop)
-- ---------------------------------------------------------------------------

-- 6.1 商品
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
('shop_products', '商品台账', '/shop/products', 'q_shop_products', 'entity_shop_product',
'{
  "presentation": {
    "title": "商品台账",
    "description": "小店商品主数据：库存、价格、安全库存。行上可看流水/销售，可停用启用。",
    "badge": "Shop SaaS",
    "emptyState": "暂无商品，请新增。"
  },
  "dataSource": { "queryCode": "q_shop_products", "pageSize": 20, "pageSizeOptions": [10, 20, 50] },
  "table": {
    "columns": [
      {"field": "sku", "label": "货号", "width": 130},
      {"field": "name", "label": "名称", "width": 160},
      {"field": "category", "label": "分类", "width": 90, "format": "badge", "tone": "accent"},
      {"field": "unit", "label": "单位", "width": 60},
      {"field": "cost_price", "label": "进价", "width": 90, "format": "money", "align": "right"},
      {"field": "sale_price", "label": "售价", "width": 90, "format": "money", "align": "right"},
      {"field": "qty_on_hand", "label": "库存", "width": 80, "format": "number", "align": "right",
        "toneRules": [
          {"when": "value <= row.safety_qty", "tone": "danger"},
          {"when": "value > row.safety_qty", "tone": "success"}
        ]},
      {"field": "safety_qty", "label": "安全库存", "width": 90, "format": "number", "align": "right"},
      {"field": "status", "label": "状态", "width": 70, "format": "badge",
        "toneRules": [{"when": "value == 1", "tone": "success"}, {"when": "value == 0", "tone": "muted"}]},
      {"field": "updated_at", "label": "更新", "width": 150, "format": "datetime"}
    ],
    "filters": [
      {"field": "sku", "label": "货号", "type": "text"},
      {"field": "name", "label": "名称", "type": "text"},
      {"field": "category", "label": "分类", "type": "select",
        "options": {"source": "sql", "queryCode": "q_shop_category_options", "labelField": "label", "valueField": "value"}},
      {"field": "status", "label": "状态", "type": "select",
        "options": {"source": "static", "items": [{"label": "启用", "value": "1"}, {"label": "停用", "value": "0"}]}}
    ],
    "actions": [
      {"code": "refresh", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary"},
      {"code": "export", "label": "导出", "dsl": "grid.exportCsv", "scope": "page", "variant": "secondary"},
      {"code": "create", "label": "新增商品", "dsl": "record.create", "scope": "page", "variant": "success"},
      {"code": "moves", "type": "openQuery", "label": "流水", "scope": "row", "variant": "secondary",
        "openQuery": {"queryCode": "q_shop_moves_by_sku", "title": "库存流水 · {{row.sku}}", "bind": {"sku": {"from": "row", "field": "sku", "required": true}}}},
      {"code": "sales", "type": "openQuery", "label": "销售", "scope": "row", "variant": "secondary",
        "openQuery": {"queryCode": "q_shop_sales_by_sku", "title": "销售明细 · {{row.sku}}", "bind": {"sku": {"from": "row", "field": "sku", "required": true}}}},
      {"code": "disable", "type": "sqlTransaction", "actionCode": "shop_disable_product", "label": "停用", "scope": "row", "variant": "danger",
        "confirmText": "确认停用？", "when": {"field": "status", "notEquals": 0}},
      {"code": "enable", "type": "sqlTransaction", "actionCode": "shop_enable_product", "label": "启用", "scope": "row", "variant": "success",
        "confirmText": "确认启用？", "when": {"field": "status", "equals": 0}}
    ]
  },
  "features": {"pagination": true, "create": true, "edit": true, "delete": true, "export": true, "density": "comfortable"}
}'::jsonb);

-- 6.2 客户
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
('shop_customers', '客户', '/shop/customers', 'q_shop_customers', 'entity_shop_customer',
'{
  "presentation": {
    "title": "客户档案",
    "description": "小店客户主数据。可钻取该客户的销售明细。",
    "badge": "Shop SaaS",
    "emptyState": "暂无客户。"
  },
  "dataSource": { "queryCode": "q_shop_customers", "pageSize": 20 },
  "table": {
    "columns": [
      {"field": "customer_code", "label": "编码", "width": 120},
      {"field": "customer_name", "label": "名称", "width": 160},
      {"field": "phone", "label": "电话", "width": 120},
      {"field": "status", "label": "状态", "width": 70, "format": "badge",
        "toneRules": [{"when": "value == 1", "tone": "success"}, {"when": "value == 0", "tone": "muted"}]},
      {"field": "remark", "label": "备注", "width": 160},
      {"field": "created_at", "label": "创建", "width": 150, "format": "datetime"}
    ],
    "filters": [
      {"field": "customer_code", "label": "编码", "type": "text"},
      {"field": "customer_name", "label": "名称", "type": "text"}
    ],
    "actions": [
      {"code": "refresh", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary"},
      {"code": "create", "label": "新增客户", "dsl": "record.create", "scope": "page", "variant": "success"},
      {"code": "sales", "type": "openQuery", "label": "销售记录", "scope": "row", "variant": "secondary",
        "openQuery": {"queryCode": "q_shop_sales_by_customer", "title": "客户销售 · {{row.customer_name}}",
          "bind": {"customer_code": {"from": "row", "field": "customer_code", "required": true}}}}
    ]
  },
  "features": {"pagination": true, "create": true, "edit": true, "delete": true, "export": true}
}'::jsonb);

-- 6.3 供应商
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
('shop_suppliers', '供应商', '/shop/suppliers', 'q_shop_suppliers', 'entity_shop_supplier',
'{
  "presentation": {
    "title": "供应商档案",
    "description": "供应商主数据。可钻取采购明细。",
    "badge": "Shop SaaS",
    "emptyState": "暂无供应商。"
  },
  "dataSource": { "queryCode": "q_shop_suppliers", "pageSize": 20 },
  "table": {
    "columns": [
      {"field": "supplier_code", "label": "编码", "width": 120},
      {"field": "supplier_name", "label": "名称", "width": 160},
      {"field": "phone", "label": "电话", "width": 120},
      {"field": "status", "label": "状态", "width": 70, "format": "badge",
        "toneRules": [{"when": "value == 1", "tone": "success"}, {"when": "value == 0", "tone": "muted"}]},
      {"field": "remark", "label": "备注", "width": 160},
      {"field": "created_at", "label": "创建", "width": 150, "format": "datetime"}
    ],
    "filters": [
      {"field": "supplier_code", "label": "编码", "type": "text"},
      {"field": "supplier_name", "label": "名称", "type": "text"}
    ],
    "actions": [
      {"code": "refresh", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary"},
      {"code": "create", "label": "新增供应商", "dsl": "record.create", "scope": "page", "variant": "success"},
      {"code": "purchases", "type": "openQuery", "label": "采购记录", "scope": "row", "variant": "secondary",
        "openQuery": {"queryCode": "q_shop_purchases_by_supplier", "title": "供应商采购 · {{row.supplier_name}}",
          "bind": {"supplier_code": {"from": "row", "field": "supplier_code", "required": true}}}}
    ]
  },
  "features": {"pagination": true, "create": true, "edit": true, "delete": true, "export": true}
}'::jsonb);

-- 6.4 库存流水
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
('shop_stock_moves', '库存流水', '/shop/stock-moves', 'q_shop_stock_moves', 'entity_shop_stock_move',
'{
  "presentation": {
    "title": "库存流水",
    "description": "所有入/出/调整流水。采购确认入库、销售确认出库会自动写入。",
    "badge": "Shop SaaS",
    "emptyState": "暂无流水。"
  },
  "dataSource": { "queryCode": "q_shop_stock_moves", "pageSize": 30 },
  "table": {
    "columns": [
      {"field": "move_id", "label": "ID", "width": 70},
      {"field": "sku", "label": "货号", "width": 130},
      {"field": "move_type", "label": "类型", "width": 80, "format": "badge",
        "toneRules": [
          {"when": "value == IN", "tone": "success"},
          {"when": "value == OUT", "tone": "danger"},
          {"when": "value == ADJ", "tone": "accent"}
        ]},
      {"field": "qty", "label": "数量", "width": 90, "format": "number", "align": "right"},
      {"field": "ref_no", "label": "关联单号", "width": 120},
      {"field": "remark", "label": "备注", "width": 160},
      {"field": "created_at", "label": "时间", "width": 160, "format": "datetime"}
    ],
    "filters": [
      {"field": "sku", "label": "货号", "type": "text"},
      {"field": "move_type", "label": "类型", "type": "select",
        "options": {"source": "static", "items": [
          {"label": "入库 IN", "value": "IN"},
          {"label": "出库 OUT", "value": "OUT"},
          {"label": "调整 ADJ", "value": "ADJ"}
        ]}},
      {"field": "ref_no", "label": "单号", "type": "text"}
    ],
    "actions": [
      {"code": "refresh", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary"},
      {"code": "export", "label": "导出", "dsl": "grid.exportCsv", "scope": "page", "variant": "secondary"},
      {"code": "create", "label": "手工登记", "dsl": "record.create", "scope": "page", "variant": "success"}
    ]
  },
  "features": {"pagination": true, "create": true, "edit": true, "delete": true, "export": true}
}'::jsonb);

-- 6.5 采购明细（无主从：明细台账 + 同单号钻取 + 行确认入库事务）
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
('shop_purchases', '采购明细', '/shop/purchases', 'q_shop_purchases', 'entity_shop_purchase',
'{
  "presentation": {
    "title": "采购明细台账",
    "description": "1.x 无主副表：用采购单号把多行明细关联。草稿行可「确认入库」：事务更新库存并写流水。",
    "badge": "Shop SaaS · 非主从",
    "emptyState": "暂无采购明细。"
  },
  "dataSource": { "queryCode": "q_shop_purchases", "pageSize": 20 },
  "table": {
    "columns": [
      {"field": "purchase_no", "label": "采购单号", "width": 120},
      {"field": "supplier_code", "label": "供应商", "width": 100},
      {"field": "sku", "label": "货号", "width": 120},
      {"field": "qty", "label": "数量", "width": 80, "format": "number", "align": "right"},
      {"field": "unit_cost", "label": "单价", "width": 90, "format": "money", "align": "right"},
      {"field": "amount", "label": "金额", "width": 100, "format": "money", "align": "right"},
      {"field": "status", "label": "状态", "width": 80, "format": "badge",
        "toneRules": [{"when": "value == 0", "tone": "accent"}, {"when": "value == 1", "tone": "success"}]},
      {"field": "purchase_date", "label": "日期", "width": 110, "format": "date"},
      {"field": "remark", "label": "备注", "width": 140}
    ],
    "filters": [
      {"field": "purchase_no", "label": "采购单号", "type": "text"},
      {"field": "supplier_code", "label": "供应商", "type": "select",
        "options": {"source": "sql", "queryCode": "q_shop_supplier_options", "labelField": "label", "valueField": "value"}},
      {"field": "sku", "label": "货号", "type": "select",
        "options": {"source": "sql", "queryCode": "q_shop_sku_options", "labelField": "label", "valueField": "value"}},
      {"field": "status", "label": "状态", "type": "select",
        "options": {"source": "static", "items": [{"label": "草稿", "value": "0"}, {"label": "已入库", "value": "1"}]}}
    ],
    "actions": [
      {"code": "refresh", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary"},
      {"code": "create", "label": "新增明细行", "dsl": "record.create", "scope": "page", "variant": "success"},
      {"code": "same_po", "type": "openQuery", "label": "同单明细", "scope": "row", "variant": "secondary",
        "openQuery": {"queryCode": "q_shop_lines_by_purchase_no", "title": "采购单 {{row.purchase_no}}",
          "bind": {"purchase_no": {"from": "row", "field": "purchase_no", "required": true}}}},
      {"code": "post", "type": "sqlTransaction", "actionCode": "shop_post_purchase_line", "label": "确认入库",
        "scope": "row", "variant": "primary", "confirmText": "确认本行入库并增加库存？",
        "when": {"field": "status", "equals": 0}}
    ]
  },
  "features": {"pagination": true, "create": true, "edit": true, "delete": true, "export": true}
}'::jsonb);

-- 6.6 销售明细
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
('shop_sales', '销售明细', '/shop/sales', 'q_shop_sales', 'entity_shop_sale',
'{
  "presentation": {
    "title": "销售明细台账",
    "description": "1.x 无主副表：销售单号关联多行。草稿行「确认出库」会校验库存、扣库存、写流水。",
    "badge": "Shop SaaS · 非主从",
    "emptyState": "暂无销售明细。"
  },
  "dataSource": { "queryCode": "q_shop_sales", "pageSize": 20 },
  "table": {
    "columns": [
      {"field": "sale_no", "label": "销售单号", "width": 120},
      {"field": "customer_code", "label": "客户", "width": 100},
      {"field": "sku", "label": "货号", "width": 120},
      {"field": "qty", "label": "数量", "width": 80, "format": "number", "align": "right"},
      {"field": "unit_price", "label": "单价", "width": 90, "format": "money", "align": "right"},
      {"field": "amount", "label": "金额", "width": 100, "format": "money", "align": "right"},
      {"field": "status", "label": "状态", "width": 80, "format": "badge",
        "toneRules": [{"when": "value == 0", "tone": "accent"}, {"when": "value == 1", "tone": "success"}]},
      {"field": "sale_date", "label": "日期", "width": 110, "format": "date"},
      {"field": "remark", "label": "备注", "width": 140}
    ],
    "filters": [
      {"field": "sale_no", "label": "销售单号", "type": "text"},
      {"field": "customer_code", "label": "客户", "type": "select",
        "options": {"source": "sql", "queryCode": "q_shop_customer_options", "labelField": "label", "valueField": "value"}},
      {"field": "sku", "label": "货号", "type": "select",
        "options": {"source": "sql", "queryCode": "q_shop_sku_options", "labelField": "label", "valueField": "value"}},
      {"field": "status", "label": "状态", "type": "select",
        "options": {"source": "static", "items": [{"label": "草稿", "value": "0"}, {"label": "已出库", "value": "1"}]}}
    ],
    "actions": [
      {"code": "refresh", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary"},
      {"code": "create", "label": "新增明细行", "dsl": "record.create", "scope": "page", "variant": "success"},
      {"code": "same_so", "type": "openQuery", "label": "同单明细", "scope": "row", "variant": "secondary",
        "openQuery": {"queryCode": "q_shop_lines_by_sale_no", "title": "销售单 {{row.sale_no}}",
          "bind": {"sale_no": {"from": "row", "field": "sale_no", "required": true}}}},
      {"code": "post", "type": "sqlTransaction", "actionCode": "shop_post_sale_line", "label": "确认出库",
        "scope": "row", "variant": "danger", "confirmText": "确认出库？将校验并扣减库存。",
        "when": {"field": "status", "equals": 0}}
    ]
  },
  "features": {"pagination": true, "create": true, "edit": true, "delete": true, "export": true}
}'::jsonb);

-- 6.7 低库存看板（只读 rawSql）
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
('shop_low_stock', '低库存预警', '/shop/low-stock', 'q_shop_low_stock', NULL,
'{
  "presentation": {
    "title": "低库存预警",
    "description": "只读 SQL 视图：启用商品中库存 ≤ 安全库存。不开启 CRUD。",
    "badge": "Shop SaaS · 只读",
    "emptyState": "暂无低库存商品 👍"
  },
  "dataSource": { "queryCode": "q_shop_low_stock", "pageSize": 50 },
  "table": {
    "columns": [
      {"field": "sku", "label": "货号", "width": 130},
      {"field": "name", "label": "名称", "width": 160},
      {"field": "category", "label": "分类", "width": 90, "format": "badge"},
      {"field": "qty_on_hand", "label": "现存量", "width": 90, "format": "number", "align": "right", "tone": "danger"},
      {"field": "safety_qty", "label": "安全库存", "width": 90, "format": "number", "align": "right"},
      {"field": "shortage", "label": "缺口", "width": 80, "format": "number", "align": "right", "tone": "danger"},
      {"field": "sale_price", "label": "售价", "width": 90, "format": "money", "align": "right"}
    ],
    "filters": [
      {"field": "sku", "label": "货号", "type": "text"},
      {"field": "category", "label": "分类", "type": "text"}
    ],
    "actions": [
      {"code": "refresh", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary"},
      {"code": "export", "label": "导出", "dsl": "grid.exportCsv", "scope": "page", "variant": "secondary"}
    ]
  },
  "features": {"pagination": true, "create": false, "edit": false, "delete": false, "export": true}
}'::jsonb);

-- 6.8 今日销售（只读）
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
('shop_today_sales', '今日销售', '/shop/today-sales', 'q_shop_today_sales', NULL,
'{
  "presentation": {
    "title": "今日销售",
    "description": "只读：sale_date = 今天 的销售明细（含草稿与已出库）。",
    "badge": "Shop SaaS · 只读",
    "emptyState": "今日尚无销售记录。"
  },
  "dataSource": { "queryCode": "q_shop_today_sales", "pageSize": 50 },
  "table": {
    "columns": [
      {"field": "sale_no", "label": "单号", "width": 120},
      {"field": "customer_code", "label": "客户", "width": 100},
      {"field": "sku", "label": "货号", "width": 120},
      {"field": "qty", "label": "数量", "width": 80, "format": "number", "align": "right"},
      {"field": "unit_price", "label": "单价", "width": 90, "format": "money", "align": "right"},
      {"field": "amount", "label": "金额", "width": 100, "format": "money", "align": "right"},
      {"field": "status", "label": "状态", "width": 80, "format": "badge",
        "toneRules": [{"when": "value == 0", "tone": "accent"}, {"when": "value == 1", "tone": "success"}]},
      {"field": "sale_date", "label": "日期", "width": 110, "format": "date"}
    ],
    "filters": [
      {"field": "sale_no", "label": "单号", "type": "text"},
      {"field": "customer_code", "label": "客户", "type": "text"}
    ],
    "actions": [
      {"code": "refresh", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary"},
      {"code": "export", "label": "导出", "dsl": "grid.exportCsv", "scope": "page", "variant": "secondary"}
    ]
  },
  "features": {"pagination": true, "create": false, "edit": false, "delete": false, "export": true}
}'::jsonb);

COMMIT;
