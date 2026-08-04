-- Register MySQL secondary datasource + page/query on PLATFORM Postgres (lc_*).
-- Password is set via API (encrypted) by setup script; this file only prepares
-- optional pages after ds_code exists. Prefer: bash demos/mysql_ds/setup.sh

-- Safe meta only (no password insert here).
DELETE FROM lc_page_model WHERE page_code IN ('mx_product_list', 'mx_ds_guide');
DELETE FROM lc_query_model WHERE query_code IN ('q_mx_products', 'q_mx_kpi', 'q_mx_ds_guide');
DELETE FROM lc_entity_model WHERE entity_code IN ('entity_mx_product', 'entity_mx_ds_guide');

INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES
(
  'entity_mx_ds_guide', 'lc_page_model', 'step_no',
  '[{"field":"step_no","label":"#","type":"integer"},{"field":"topic","label":"主题","type":"string"},{"field":"hint","label":"说明","type":"string"}]'::jsonb
),
(
  'entity_mx_product', 'mx_product', 'id',
  $f$[
    {"field":"id","label":"ID","type":"integer"},
    {"field":"sku","label":"SKU","type":"string"},
    {"field":"product_name","label":"名称","type":"string"},
    {"field":"category","label":"分类","type":"string"},
    {"field":"price","label":"价格","type":"number"},
    {"field":"stock_qty","label":"库存","type":"integer"},
    {"field":"status","label":"状态","type":"integer"}
  ]$f$::jsonb
);

INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, data_source_code, params_json) VALUES
(
  'q_mx_ds_guide', 'entity_mx_ds_guide',
  $sql$
SELECT * FROM (VALUES
  (1, '双库架构', '平台库 PG=lc_* 元数据；业务库 MySQL=biz_mysql'),
  (2, '解析顺序', 'page.data_source_code > query.data_source_code > default'),
  (3, 'mx_product_list', '页面绑定 ds=biz_mysql，SQL 不写库名'),
  (4, '管理台', 'DataSource Console 可改连接/试连；密码只写不读')
) AS t(step_no, topic, hint) ORDER BY step_no
$sql$,
  'rawSql', NULL, '[]'::jsonb
),
(
  'q_mx_products', 'entity_mx_product',
  'SELECT id, sku, product_name, category, price, stock_qty, status, remark, created_at FROM mx_product WHERE status = 1 ORDER BY id',
  'rawSql', 'biz_mysql', '[]'::jsonb
),
(
  'q_mx_kpi', NULL,
  'SELECT metric_code, metric_value, label_zh FROM mx_kpi ORDER BY id',
  'rawSql', 'biz_mysql', '[]'::jsonb
);

INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, data_source_code, config_json) VALUES
(
  'mx_ds_guide', '多数据源 · 导览', '/demo/mx-ds-guide', 'q_mx_ds_guide', 'entity_mx_ds_guide', NULL,
  $cfg${
  "version": 1,
  "presentation": {
    "title": "多数据源导览",
    "description": "平台 PG + 业务 MySQL。打开 mx_product_list 验证二次源查询。",
    "badge": "Multi-DS"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": false },
  "table": {
    "columns": [
      { "field": "step_no", "label": "#", "width": 56 },
      { "field": "topic", "label": "主题", "width": 160 },
      { "field": "hint", "label": "说明", "width": 480 }
    ],
    "filters": [],
    "actions": []
  }
}$cfg$::jsonb
),
(
  'mx_product_list', '多数据源 · MySQL 商品', '/demo/mx-products', 'q_mx_products', 'entity_mx_product', 'biz_mysql',
  $cfg${
  "version": 1,
  "presentation": {
    "title": "MySQL 业务库商品",
    "description": "data_source_code=biz_mysql。数据在 Docker MySQL，元数据在 Postgres。",
    "badge": "MySQL DS"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": true },
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 64 },
      { "field": "sku", "label": "SKU", "width": 100 },
      { "field": "product_name", "label": "名称", "width": 180 },
      { "field": "category", "label": "分类", "width": 90 },
      { "field": "price", "label": "价格", "width": 90, "format": "money", "align": "right" },
      { "field": "stock_qty", "label": "库存", "width": 80, "format": "number" },
      { "field": "status", "label": "状态", "width": 70 }
    ],
    "filters": [
      { "field": "product_name", "label": "名称", "type": "text" }
    ],
    "actions": [
      { "code": "refresh_grid", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary" }
    ]
  }
}$cfg$::jsonb
);

INSERT INTO lc_permission (perm_code, perm_type, resource_code, description)
SELECT v.p, v.t, v.r, v.d FROM (VALUES
  ('page:mx_ds_guide','page','mx_ds_guide','mx guide'),
  ('page:mx_product_list','page','mx_product_list','mx products'),
  ('query:q_mx_ds_guide','query','q_mx_ds_guide','q'),
  ('query:q_mx_products','query','q_mx_products','q'),
  ('query:q_mx_kpi','query','q_mx_kpi','q')
) AS v(p,t,r,d)
ON CONFLICT (perm_code) DO NOTHING;

INSERT INTO lc_role_permission (role_code, perm_code)
SELECT 'owner', perm_code FROM lc_permission
WHERE perm_code LIKE 'page:mx_%' OR perm_code LIKE 'query:q_mx_%'
ON CONFLICT DO NOTHING;
