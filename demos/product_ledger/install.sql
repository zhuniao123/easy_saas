-- Product Ledger demo (Phase B) — pure SQL + metadata, zero custom Java.
-- Run against the lowcode database after schema.sql is applied:
--   psql -U lowcode -d lowcode -f demos/product_ledger/install.sql
--
-- query_mode = singleTableTemplate enables server-side writable gate.
-- features.create/edit/delete must be true in page config (opt-in).

BEGIN;

-- 1. Business table
DROP TABLE IF EXISTS demo_product CASCADE;
CREATE TABLE demo_product (
    id            BIGSERIAL PRIMARY KEY,
    sku           VARCHAR(50)  NOT NULL UNIQUE,
    name          VARCHAR(200) NOT NULL,
    category      VARCHAR(100) NOT NULL DEFAULT 'General',
    unit          VARCHAR(20)  NOT NULL DEFAULT 'pcs',
    cost_price    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sale_price    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    qty_on_hand   NUMERIC(12, 2) NOT NULL DEFAULT 0,
    safety_qty    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status        INTEGER      NOT NULL DEFAULT 1,
    remark        TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO demo_product (sku, name, category, unit, cost_price, sale_price, qty_on_hand, safety_qty, status, remark) VALUES
('SKU-COLA-330',  'Cola 330ml',           'Beverage', 'can',  1.20,  3.50, 120, 30, 1, 'Best seller'),
('SKU-WATER-550', 'Mineral Water 550ml',  'Beverage', 'bot',  0.40,  1.50,  8, 20, 1, 'Below safety stock'),
('SKU-CHIPS-大',  'Potato Chips Large',   'Snack',    'bag',  4.00,  9.90, 45, 15, 1, NULL),
('SKU-RICE-5KG',  'Rice 5kg',             'Staple',   'bag', 18.00, 29.90, 12, 10, 1, NULL),
('SKU-OLD-TEA',   'Discontinued Tea',     'Beverage', 'box',  8.00, 15.00,  0,  5, 0, 'Stopped');

-- 2. Metadata cleanup
DELETE FROM lc_page_model WHERE page_code = 'product_ledger';
DELETE FROM lc_query_model WHERE query_code IN ('q_product_ledger', 'q_product_category_options');
DELETE FROM lc_entity_model WHERE entity_code = 'entity_product';

-- 3. Entity
INSERT INTO lc_entity_model (entity_code, table_name, primary_key, label_field, fields_json)
VALUES (
    'entity_product',
    'demo_product',
    'id',
    'name',
    '[
      {"field":"id","label":"ID","type":"integer","readonly":true},
      {"field":"sku","label":"SKU","type":"string","required":true},
      {"field":"name","label":"Name","type":"string","required":true},
      {"field":"category","label":"Category","type":"string"},
      {"field":"unit","label":"Unit","type":"string"},
      {"field":"cost_price","label":"Cost","type":"number","format":"money"},
      {"field":"sale_price","label":"Sale Price","type":"number","format":"money"},
      {"field":"qty_on_hand","label":"On Hand","type":"number"},
      {"field":"safety_qty","label":"Safety Qty","type":"number"},
      {"field":"status","label":"Status","type":"integer"},
      {"field":"remark","label":"Remark","type":"string"},
      {"field":"created_at","label":"Created","type":"datetime","readonly":true},
      {"field":"updated_at","label":"Updated","type":"datetime","readonly":true}
    ]'::jsonb
);

-- 4. Queries
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode)
VALUES
(
    'q_product_ledger',
    'entity_product',
    'SELECT id, sku, name, category, unit, cost_price, sale_price, qty_on_hand, safety_qty, status, remark, created_at, updated_at FROM demo_product',
    'singleTableTemplate'
),
(
    'q_product_category_options',
    NULL,
    'SELECT DISTINCT category AS value, category AS label FROM demo_product ORDER BY category',
    'rawSql'
);

-- 5. Action catalog (Phase C) — SQL lives here, not in browser requests
DELETE FROM lc_action WHERE action_code IN ('disable_product', 'enable_product', 'qty_plus_one');

INSERT INTO lc_action (action_code, action_type, label, config_json, enabled) VALUES
(
  'disable_product',
  'sqlTransaction',
  '停用商品',
  '{
    "type": "sqlTransaction",
    "timeoutSeconds": 10,
    "refresh": true,
    "successMessage": "商品已停用",
    "bind": {
      "id": { "from": "row", "field": "id", "required": true },
      "status": { "from": "fixed", "value": 0 }
    },
    "statements": [
      {
        "name": "disable",
        "kind": "write",
        "sql": "UPDATE demo_product SET status = :status, updated_at = NOW() WHERE id = :id"
      }
    ]
  }'::jsonb,
  true
),
(
  'enable_product',
  'sqlTransaction',
  '启用商品',
  '{
    "type": "sqlTransaction",
    "refresh": true,
    "successMessage": "商品已启用",
    "bind": {
      "id": { "from": "row", "field": "id", "required": true },
      "status": { "from": "fixed", "value": 1 }
    },
    "statements": [
      {
        "kind": "write",
        "sql": "UPDATE demo_product SET status = :status, updated_at = NOW() WHERE id = :id"
      }
    ]
  }'::jsonb,
  true
),
(
  'qty_plus_one',
  'sqlTransaction',
  '库存+1',
  '{
    "type": "sqlTransaction",
    "refresh": true,
    "successMessage": "库存已 +1（演示调整，不是进销存过账）",
    "bind": {
      "id": { "from": "row", "field": "id", "required": true }
    },
    "statements": [
      {
        "kind": "assert",
        "sql": "SELECT (status = 1) AS ok FROM demo_product WHERE id = :id"
      },
      {
        "kind": "write",
        "sql": "UPDATE demo_product SET qty_on_hand = qty_on_hand + 1, updated_at = NOW() WHERE id = :id AND status = 1"
      }
    ]
  }'::jsonb,
  true
);

-- 6. Page (building-block config) — UI binds actionCode only
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
    'product_ledger',
    '商品台账 Product Ledger',
    '/inventory/products',
    'q_product_ledger',
    'entity_product',
    '{
      "presentation": {
        "title": "商品台账",
        "description": "Phase B+C: single-table ledger + catalog sqlTransaction actions (no client SQL).",
        "badge": "1.x Building Blocks",
        "emptyState": "No products yet. Click Add or import later (1.7)."
      },
      "dataSource": {
        "queryCode": "q_product_ledger",
        "pageSize": 20,
        "pageSizeOptions": [10, 20, 50]
      },
      "table": {
        "columns": [
          {"field": "sku", "label": "货号", "width": 140},
          {"field": "name", "label": "名称", "width": 180},
          {"field": "category", "label": "分类", "width": 100, "format": "badge", "tone": "accent"},
          {"field": "unit", "label": "单位", "width": 70},
          {"field": "cost_price", "label": "进价", "width": 100, "format": "money", "align": "right"},
          {"field": "sale_price", "label": "售价", "width": 100, "format": "money", "align": "right"},
          {
            "field": "qty_on_hand",
            "label": "库存",
            "width": 90,
            "format": "number",
            "align": "right",
            "toneRules": [
              {"when": "value <= row.safety_qty", "tone": "danger"},
              {"when": "value > row.safety_qty", "tone": "success"}
            ]
          },
          {"field": "safety_qty", "label": "安全库存", "width": 90, "format": "number", "align": "right"},
          {
            "field": "status",
            "label": "状态",
            "width": 80,
            "format": "badge",
            "toneRules": [
              {"when": "value == 1", "tone": "success"},
              {"when": "value == 0", "tone": "muted"}
            ]
          },
          {"field": "updated_at", "label": "更新时间", "width": 160, "format": "datetime"}
        ],
        "filters": [
          {"field": "sku", "label": "货号", "type": "text"},
          {"field": "name", "label": "名称", "type": "text"},
          {
            "field": "category",
            "label": "分类",
            "type": "select",
            "options": {
              "source": "sql",
              "queryCode": "q_product_category_options",
              "labelField": "label",
              "valueField": "value"
            }
          },
          {
            "field": "status",
            "label": "状态",
            "type": "select",
            "options": {
              "source": "static",
              "items": [
                {"label": "启用", "value": "1"},
                {"label": "停用", "value": "0"}
              ]
            }
          }
        ],
        "actions": [
          {"code": "refresh_grid", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary"},
          {"code": "export_grid", "label": "导出 CSV", "dsl": "grid.exportCsv", "scope": "page", "variant": "secondary"},
          {"code": "create_product", "label": "新增商品", "dsl": "record.create", "scope": "page", "variant": "success"},
          {"code": "dup_row", "label": "复制", "dsl": "record.duplicate", "scope": "row", "variant": "secondary"},
          {
            "code": "disable_product",
            "actionCode": "disable_product",
            "type": "sqlTransaction",
            "label": "停用",
            "scope": "row",
            "variant": "danger",
            "confirmText": "确认停用该商品？",
            "when": { "field": "status", "notEquals": 0 }
          },
          {
            "code": "enable_product",
            "actionCode": "enable_product",
            "type": "sqlTransaction",
            "label": "启用",
            "scope": "row",
            "variant": "success",
            "confirmText": "确认重新启用？",
            "when": { "field": "status", "equals": 0 }
          },
          {
            "code": "qty_plus_one",
            "actionCode": "qty_plus_one",
            "type": "sqlTransaction",
            "label": "库存+1",
            "scope": "row",
            "variant": "secondary",
            "confirmText": "演示用简易调整，不是进销存过账。继续？",
            "when": { "field": "status", "equals": 1 }
          }
        ]
      },
      "features": {
        "pagination": true,
        "create": true,
        "edit": true,
        "delete": true,
        "export": true,
        "density": "comfortable"
      }
    }'::jsonb
);

COMMIT;
