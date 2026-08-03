-- Dashboard Lite demo (Slice 7): fixed Row/Column/Section layout + independent SQL components.
-- Idempotent. Uses VALUES / generate_series — no physical business tables.

BEGIN;

DELETE FROM lc_page_model WHERE page_code IN ('dash_lite_home', 'dash_lite_guide');
DELETE FROM lc_query_model WHERE query_code IN (
  'q_dash_kpi',
  'q_dash_appointments',
  'q_dash_staff',
  'q_dash_service_cat',
  'q_dash_orders',
  'q_dash_guide'
);
DELETE FROM lc_entity_model WHERE entity_code IN (
  'entity_dash_orders',
  'entity_dash_guide'
);

-- ---------------------------------------------------------------------------
-- Entities (metadata only; queries are rawSql)
-- ---------------------------------------------------------------------------
INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES
(
  'entity_dash_guide', 'lc_page_model', 'step_no',
  '[{"field":"step_no","label":"#","type":"integer"},{"field":"topic","label":"主题","type":"string"},{"field":"hint","label":"说明","type":"string"}]'::jsonb
),
(
  'entity_dash_orders', 'lc_page_model', 'order_no',
  '[{"field":"order_no","label":"单号","type":"string"},{"field":"member_name","label":"会员","type":"string"},{"field":"service_name","label":"项目","type":"string"},{"field":"staff_name","label":"员工","type":"string"},{"field":"amount","label":"金额","type":"number"},{"field":"status","label":"状态","type":"string"}]'::jsonb
);

-- ---------------------------------------------------------------------------
-- Queries
-- ---------------------------------------------------------------------------
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, params_json)
VALUES (
  'q_dash_guide',
  'entity_dash_guide',
  $sql$
SELECT * FROM (VALUES
  (1, '打开 dash_lite_home', 'KPI 一行四卡 + 预约趋势/分类 + 明细表'),
  (2, 'layout 字段', '固定 12 列 grid；section 可带标题与刷新按钮'),
  (3, '独立 dataSource', '每个组件可绑不同 queryCode；筛选会并入 sharedParams'),
  (4, '不做拖拽', '布局只读配置；复杂联动交给 JS controller（本页未绑）')
) AS t(step_no, topic, hint)
ORDER BY step_no
$sql$,
  'rawSql',
  '[]'::jsonb
);

INSERT INTO lc_query_model (query_code, sql_text, query_mode)
VALUES (
  'q_dash_kpi',
  $sql$
SELECT
  18::int AS appointments_today,
  12680.5::numeric AS revenue_today,
  7::int AS pending_settle,
  6::int AS active_staff
$sql$,
  'rawSql'
);

INSERT INTO lc_query_model (query_code, sql_text, query_mode)
VALUES (
  'q_dash_appointments',
  $sql$
SELECT d::date::text AS day,
       (6 + (EXTRACT(DOW FROM d)::int * 2) + (EXTRACT(DAY FROM d)::int % 5))::int AS cnt
FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval) AS d
ORDER BY d
$sql$,
  'rawSql'
);

INSERT INTO lc_query_model (query_code, sql_text, query_mode)
VALUES (
  'q_dash_staff',
  $sql$
SELECT * FROM (VALUES
  ('林护士', 4200::numeric),
  ('王技师', 3800::numeric),
  ('陈顾问', 3100::numeric),
  ('赵前台', 1580::numeric)
) AS t(staff_name, amount)
ORDER BY amount DESC
$sql$,
  'rawSql'
);

INSERT INTO lc_query_model (query_code, sql_text, query_mode)
VALUES (
  'q_dash_service_cat',
  $sql$
SELECT * FROM (VALUES
  ('皮肤管理', 5200::numeric),
  ('美甲美睫', 3100::numeric),
  ('身体护理', 2680::numeric),
  ('会员充值', 1700.5::numeric)
) AS t(category, amount)
$sql$,
  'rawSql'
);

INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, params_json)
VALUES (
  'q_dash_orders',
  'entity_dash_orders',
  $sql$
SELECT * FROM (VALUES
  ('SO-1001', '小美', '深层清洁', '林护士', 298.00::numeric, '待结算'),
  ('SO-1002', '阿杰', '肩颈护理', '王技师', 468.00::numeric, '已完成'),
  ('SO-1003', '圆圆', '美甲套餐', '陈顾问', 188.00::numeric, '待结算'),
  ('SO-1004', '阿强', '会员充值', '赵前台', 1000.00::numeric, '已完成'),
  ('SO-1005', '小月', '美睫加长', '陈顾问', 320.00::numeric, '进行中'),
  ('SO-1006', '晓雯', '补水面膜', '林护士', 168.00::numeric, '已完成')
) AS t(order_no, member_name, service_name, staff_name, amount, status)
ORDER BY order_no
$sql$,
  'rawSql',
  '[]'::jsonb
);

-- ---------------------------------------------------------------------------
-- Pages
-- ---------------------------------------------------------------------------
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'dash_lite_guide',
  'Dashboard Lite · 导览',
  '/demo/dash-lite-guide',
  'q_dash_guide',
  'entity_dash_guide',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "Dashboard Lite 导览",
    "description": "Slice 7：固定 Row/Column/Section，不做拖拽设计器。打开 dash_lite_home 看布局。",
    "badge": "Dashboard"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": false },
  "table": {
    "columns": [
      { "field": "step_no", "label": "#", "width": 56 },
      { "field": "topic", "label": "主题", "width": 200 },
      { "field": "hint", "label": "说明", "width": 480 }
    ],
    "filters": [],
    "actions": []
  }
}
$cfg$::jsonb
);

INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'dash_lite_home',
  'Dashboard Lite · 门店看板',
  '/demo/dash-lite',
  'q_dash_orders',
  'entity_dash_orders',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "门店运营看板",
    "description": "今日预约 / 营收 / 待结算 / 在岗 · 趋势与分类 · 明细表。布局由 layout 声明，组件各自 dataSource。",
    "badge": "Dashboard Lite"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": true },
  "sharedParams": {},
  "layout": {
    "type": "dashboard",
    "gap": 16,
    "rows": [
      {
        "cols": [
          { "span": 3, "components": ["kpi_appointments"] },
          { "span": 3, "components": ["kpi_revenue"] },
          { "span": 3, "components": ["kpi_pending"] },
          { "span": 3, "components": ["kpi_staff"] }
        ]
      },
      {
        "cols": [
          {
            "span": 8,
            "section": { "title": "近 7 日预约", "description": "q_dash_appointments", "refreshable": true },
            "components": ["chart_appointments"]
          },
          {
            "span": 4,
            "section": { "title": "项目分类", "description": "q_dash_service_cat", "refreshable": true },
            "components": ["chart_category"]
          }
        ]
      },
      {
        "cols": [
          {
            "span": 5,
            "section": { "title": "员工业绩", "refreshable": true },
            "components": ["chart_staff"]
          },
          {
            "span": 7,
            "section": { "title": "今日明细", "description": "主 grid 走页面 queryCode" },
            "components": ["main_grid"]
          }
        ]
      }
    ]
  },
  "components": [
    {
      "componentCode": "kpi_appointments",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_dash_kpi" },
      "bindings": { "value": "appointments_today" },
      "properties": { "title": "今日预约", "format": "number", "subtitle": "人次" }
    },
    {
      "componentCode": "kpi_revenue",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_dash_kpi" },
      "bindings": { "value": "revenue_today" },
      "properties": { "title": "今日营收", "format": "money" }
    },
    {
      "componentCode": "kpi_pending",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_dash_kpi" },
      "bindings": { "value": "pending_settle" },
      "properties": { "title": "待结算订单", "format": "number" }
    },
    {
      "componentCode": "kpi_staff",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_dash_kpi" },
      "bindings": { "value": "active_staff" },
      "properties": { "title": "在岗员工", "format": "number" }
    },
    {
      "componentCode": "chart_appointments",
      "type": "lineChart",
      "dataSource": { "type": "sql", "queryCode": "q_dash_appointments" },
      "bindings": { "category": "day", "value": "cnt" },
      "properties": { "title": "", "legend": false, "height": 260 }
    },
    {
      "componentCode": "chart_category",
      "type": "pieChart",
      "dataSource": { "type": "sql", "queryCode": "q_dash_service_cat" },
      "bindings": { "category": "category", "value": "amount" },
      "properties": { "title": "", "legend": true, "height": 260 }
    },
    {
      "componentCode": "chart_staff",
      "type": "barChart",
      "dataSource": { "type": "sql", "queryCode": "q_dash_staff" },
      "bindings": { "category": "staff_name", "value": "amount" },
      "properties": { "title": "", "legend": false, "height": 280, "format": "money" }
    },
    {
      "componentCode": "main_grid",
      "type": "smartGrid"
    }
  ],
  "table": {
    "columns": [
      { "field": "order_no", "label": "单号", "width": 100 },
      { "field": "member_name", "label": "会员", "width": 100 },
      { "field": "service_name", "label": "项目", "width": 140 },
      { "field": "staff_name", "label": "员工", "width": 100 },
      { "field": "amount", "label": "金额", "width": 100, "format": "money", "align": "right" },
      { "field": "status", "label": "状态", "width": 100, "format": "badge" }
    ],
    "filters": [
      { "field": "member_name", "label": "会员", "type": "text" },
      { "field": "status", "label": "状态", "type": "text" }
    ],
    "actions": []
  }
}
$cfg$::jsonb
);

COMMIT;
