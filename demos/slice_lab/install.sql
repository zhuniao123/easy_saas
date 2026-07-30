-- Slice lab demo pages for manual UI verification (charts / controller / complex SQL / dynamic endpoint).
-- Idempotent: safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- Cleanup previous lab assets
-- ---------------------------------------------------------------------------
DELETE FROM lc_page_model WHERE page_code IN (
  'slice_lab_guide', 'slice_charts_lab', 'slice_complex_sql', 'slice_controller_lab'
);
DELETE FROM lc_query_model WHERE query_code IN (
  'q_slice_lab_guide', 'q_slice_kpi', 'q_slice_rev_day', 'q_slice_rev_cat',
  'q_slice_trend', 'q_slice_detail', 'q_slice_complex', 'q_slice_ctrl_grid'
);
DELETE FROM lc_entity_model WHERE entity_code IN (
  'entity_slice_lab_guide', 'entity_slice_detail', 'entity_slice_complex', 'entity_slice_ctrl'
);
DELETE FROM lc_dynamic_endpoint WHERE endpoint_code = 'ep_slice_echo';
DELETE FROM lc_script WHERE script_code IN ('ctrl_slice_lab', 'groovy_slice_echo');

-- ---------------------------------------------------------------------------
-- Shared sample facts (no physical biz tables)
-- ---------------------------------------------------------------------------
-- Queries use VALUES / generate_series so they always work.

INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES
(
  'entity_slice_lab_guide', 'lc_page_model', 'step_no',
  '[{"field":"step_no","label":"#","type":"integer"},{"field":"page_ref","label":"页面","type":"string"},{"field":"focus","label":"观察点","type":"string"}]'::jsonb
),
(
  'entity_slice_detail', 'lc_page_model', 'id',
  '[{"field":"id","label":"ID","type":"integer"},{"field":"sku","label":"SKU","type":"string"},{"field":"qty","label":"Qty","type":"integer"},{"field":"amount","label":"Amount","type":"number"}]'::jsonb
),
(
  'entity_slice_complex', 'lc_page_model', 'member_name',
  '[{"field":"member_name","label":"会员","type":"string"},{"field":"revenue","label":"营收","type":"number"}]'::jsonb
),
(
  'entity_slice_ctrl', 'lc_page_model', 'id',
  '[{"field":"id","label":"ID","type":"integer"},{"field":"name","label":"名称","type":"string"},{"field":"score","label":"分","type":"integer"}]'::jsonb
);

-- Guide list
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, params_json)
VALUES (
  'q_slice_lab_guide',
  'entity_slice_lab_guide',
  $sql$
SELECT * FROM (VALUES
  (1, 'slice_charts_lab', 'stat / bar / line / pie / text + grid 同页；点图表看 itemClick'),
  (2, 'slice_complex_sql', 'JOIN+CTE+UNION 只读 grid，排序过滤，不可写'),
  (3, 'slice_controller_lab', 'JS Page Controller：点行 toast + 可调 dynamic endpoint')
) AS t(step_no, page_ref, focus)
ORDER BY step_no
$sql$,
  'rawSql',
  '[]'::jsonb
);

-- KPI (single row)
INSERT INTO lc_query_model (query_code, sql_text, query_mode)
VALUES (
  'q_slice_kpi',
  'SELECT 12860.5::numeric AS total, 42::int AS orders, 18::int AS members',
  'rawSql'
);

-- Revenue by day
INSERT INTO lc_query_model (query_code, sql_text, query_mode)
VALUES (
  'q_slice_rev_day',
  $sql$
SELECT d::text AS day, (800 + (EXTRACT(DOW FROM d)::int * 170) + (random()*80)::int)::numeric AS amount
FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval) AS d
ORDER BY d
$sql$,
  'rawSql'
);

-- Category pie
INSERT INTO lc_query_model (query_code, sql_text, query_mode)
VALUES (
  'q_slice_rev_cat',
  $sql$
SELECT * FROM (VALUES
  ('美甲', 4200),
  ('护肤', 3100),
  ('造型', 2800),
  ('零售', 1900)
) AS t(category, amount)
$sql$,
  'rawSql'
);

-- Trend line (reuse day series alias field names)
INSERT INTO lc_query_model (query_code, sql_text, query_mode)
VALUES (
  'q_slice_trend',
  $sql$
SELECT to_char(d, 'MM-DD') AS day,
       (50 + EXTRACT(DOY FROM d)::int % 20 + (random()*10)::int)::numeric AS amount
FROM generate_series(CURRENT_DATE - 11, CURRENT_DATE, '1 day'::interval) AS d
ORDER BY d
$sql$,
  'rawSql'
);

-- Detail grid
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode)
VALUES (
  'q_slice_detail',
  'entity_slice_detail',
  $sql$
SELECT * FROM (VALUES
  (1, 'SKU-A', 3, 299.0),
  (2, 'SKU-B', 1, 128.5),
  (3, 'SKU-C', 5, 560.0),
  (4, 'SKU-D', 2, 210.0),
  (5, 'SKU-E', 4, 440.0)
) AS t(id, sku, qty, amount)
$sql$,
  'rawSql'
);

-- Complex JOIN/CTE/UNION (read-only)
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, count_sql_text, query_mode)
VALUES (
  'q_slice_complex',
  'entity_slice_complex',
  $sql$
WITH members AS (
  SELECT * FROM (VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Carol')) AS m(member_id, member_name)
),
items AS (
  SELECT * FROM (VALUES
    (10, 1, 100.0), (11, 1, 50.0), (12, 2, 80.0), (13, 3, 120.0), (14, 2, 40.0)
  ) AS i(item_id, member_id, amount)
),
member_totals AS (
  SELECT m.member_name, SUM(i.amount) AS revenue
  FROM members m
  JOIN items i ON i.member_id = m.member_id
  GROUP BY m.member_name
)
SELECT member_name, revenue FROM member_totals
UNION ALL
SELECT 'TOTAL' AS member_name, SUM(revenue) AS revenue FROM member_totals
$sql$,
  'SELECT 4',
  'rawSql'
);

-- Controller lab grid
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode)
VALUES (
  'q_slice_ctrl_grid',
  'entity_slice_ctrl',
  $sql$
SELECT * FROM (VALUES
  (1, '项目甲', 88),
  (2, '项目乙', 76),
  (3, '项目丙', 93),
  (4, '项目丁', 61)
) AS t(id, name, score)
$sql$,
  'rawSql'
);

-- ---------------------------------------------------------------------------
-- Pages
-- ---------------------------------------------------------------------------

-- 0) Guide
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'slice_lab_guide',
  'Slice Lab · 测试导览',
  '/demo/slice-lab',
  'q_slice_lab_guide',
  'entity_slice_lab_guide',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "Slice Lab · 测试导览",
    "description": "用于验收 DataTable / 组件注册 / JS Controller / 复杂 SQL / 图表。账号 owner/owner123。",
    "badge": "Slice Lab"
  },
  "features": { "create": false, "edit": false, "delete": false },
  "table": {
    "columns": [
      { "field": "step_no", "label": "#", "width": 56, "align": "center", "format": "number" },
      { "field": "page_ref", "label": "页面 code", "width": 180, "format": "badge", "tone": "accent" },
      { "field": "focus", "label": "观察点", "width": 480 }
    ],
    "filters": [],
    "actions": []
  }
}
$cfg$::jsonb
);

-- 1) Charts lab
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'slice_charts_lab',
  'Slice Lab · 图表看板',
  '/demo/slice-charts',
  'q_slice_detail',
  'entity_slice_detail',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "图表看板 Lab",
    "description": "stat / bar / line / pie / text 与 Smart Grid。点击图表应触发 itemClick（若绑定了 controller 会 toast）。",
    "badge": "Charts"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": true },
  "components": [
    {
      "componentCode": "kpi_revenue",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_slice_kpi" },
      "bindings": { "value": "total" },
      "properties": { "title": "今日营收", "format": "money", "subtitle": "q_slice_kpi.total" }
    },
    {
      "componentCode": "kpi_orders",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_slice_kpi" },
      "bindings": { "value": "orders" },
      "properties": { "title": "今日订单", "format": "number" }
    },
    {
      "componentCode": "hint",
      "type": "text",
      "properties": {
        "title": "用法提示",
        "content": "只改 dataSource.queryCode 与 bindings 列名即可复用图表。点击 bar/pie 点位会发 itemClick；本页绑定了 ctrl_slice_lab。"
      }
    },
    {
      "componentCode": "bar_day",
      "type": "barChart",
      "dataSource": { "type": "sql", "queryCode": "q_slice_rev_day" },
      "bindings": { "category": "day", "value": "amount" },
      "properties": { "title": "近 7 日营收", "legend": true, "height": 280, "format": "number" }
    },
    {
      "componentCode": "line_trend",
      "type": "lineChart",
      "dataSource": { "type": "sql", "queryCode": "q_slice_trend" },
      "bindings": { "category": "day", "value": "amount" },
      "properties": { "title": "趋势", "legend": false, "height": 260 }
    },
    {
      "componentCode": "pie_cat",
      "type": "pieChart",
      "dataSource": { "type": "sql", "queryCode": "q_slice_rev_cat" },
      "bindings": { "category": "category", "value": "amount" },
      "properties": { "title": "品类结构", "legend": true, "height": 300 }
    },
    {
      "componentCode": "main_grid",
      "type": "smartGrid"
    }
  ],
  "controller": { "scriptCode": "ctrl_slice_lab", "enabled": true },
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 64 },
      { "field": "sku", "label": "SKU", "width": 120 },
      { "field": "qty", "label": "数量", "width": 80, "format": "number" },
      { "field": "amount", "label": "金额", "width": 100, "format": "money" }
    ],
    "filters": [
      { "field": "sku", "label": "SKU", "type": "text" }
    ],
    "actions": []
  }
}
$cfg$::jsonb
);

-- 2) Complex SQL readonly
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'slice_complex_sql',
  'Slice Lab · 复杂 SQL 只读',
  '/demo/slice-complex-sql',
  'q_slice_complex',
  'entity_slice_complex',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "复杂 SQL 只读 Grid",
    "description": "CTE + JOIN + UNION + 显式 countSql。应可分页排序过滤；writable=false，无自动 CRUD。",
    "badge": "rawSql"
  },
  "features": { "create": false, "edit": false, "delete": false },
  "table": {
    "columns": [
      { "field": "member_name", "label": "会员", "width": 160 },
      { "field": "revenue", "label": "营收", "width": 120, "format": "money", "align": "right" }
    ],
    "filters": [
      { "field": "member_name", "label": "会员", "type": "text" }
    ],
    "actions": []
  }
}
$cfg$::jsonb
);

-- 3) Controller lab
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'slice_controller_lab',
  'Slice Lab · JS Controller',
  '/demo/slice-controller',
  'q_slice_ctrl_grid',
  'entity_slice_ctrl',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "JS Page Controller Lab",
    "description": "点击行应 toast；点「Echo」可调 POST /api/v1/dynamic/ep_slice_echo。",
    "badge": "Controller"
  },
  "features": { "create": false, "edit": false, "delete": false },
  "controller": { "scriptCode": "ctrl_slice_lab", "enabled": true },
  "components": [
    {
      "componentCode": "probe_banner",
      "type": "probe",
      "properties": { "label": "Registry Probe", "detail": "无需改 PageLoader 类型分支即可注册的组件" }
    },
    {
      "componentCode": "score_bar",
      "type": "barChart",
      "dataSource": { "type": "sql", "queryCode": "q_slice_ctrl_grid" },
      "bindings": { "category": "name", "value": "score" },
      "properties": { "title": "分数条形图（点击触发 itemClick）", "height": 240 }
    },
    { "componentCode": "main_grid", "type": "smartGrid" }
  ],
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 64 },
      { "field": "name", "label": "名称", "width": 160 },
      { "field": "score", "label": "分", "width": 80, "format": "number" }
    ],
    "filters": [],
    "actions": []
  }
}
$cfg$::jsonb
);

-- ---------------------------------------------------------------------------
-- JS Page Controller (published)
-- ---------------------------------------------------------------------------
INSERT INTO lc_script (script_code, script_type, script_content, status, version, page_code, remark)
VALUES (
  'ctrl_slice_lab',
  'PAGE_CONTROLLER',
  $js$
export default {
  async onReady(ctx) {
    ctx.ui.log('info', 'slice lab controller ready', { page: ctx.pageCode, v: ctx.version });
    ctx.ui.toast('Controller ready · ' + ctx.pageCode);
  },
  async onEvent(event, ctx) {
    if (event.type === 'rowClick' || event.type === 'itemClick') {
      const name = event.payload?.name
        || event.payload?.row?.name
        || event.payload?.row?.sku
        || event.payload?.row?.member_name
        || event.componentCode;
      const value = event.payload?.value
        ?? event.payload?.row?.score
        ?? event.payload?.row?.amount
        ?? event.payload?.row?.revenue;
      ctx.state.set('lastEvent', event.type);
      ctx.state.set('lastName', name);
      ctx.ui.toast(event.type + ': ' + name + (value != null ? ' = ' + value : ''));
      ctx.ui.log('info', 'event', event);
    }
    if (event.type === 'ready') {
      ctx.ui.log('info', 'page ready event', event.payload);
    }
  },
  async onError(err, ctx) {
    ctx.ui.log('error', 'controller error', err);
    ctx.ui.toast('Controller error: ' + (err && err.message ? err.message : String(err)));
  },
  async onDispose(ctx) {
    ctx.ui.log('info', 'controller disposed', { page: ctx.pageCode });
  }
};
$js$,
  'PUBLISHED',
  1,
  'slice_controller_lab',
  'Slice lab page controller'
);

-- ---------------------------------------------------------------------------
-- Dynamic Groovy endpoint (published)
-- ---------------------------------------------------------------------------
INSERT INTO lc_script (script_code, script_type, script_content, status, version, remark)
VALUES (
  'groovy_slice_echo',
  'BACKEND_GROOVY',
  $groovy$
import com.example.lowcode.script.IDynamicEndpointHandler
import com.example.lowcode.script.DynamicContext

class SliceEcho implements IDynamicEndpointHandler {
  Object handle(DynamicContext ctx) {
    def msg = ctx.get('message') ?: 'hello'
    def n = (ctx.get('n') ?: 1) as int
    return [
      echo: msg,
      n: n,
      doubled: n * 2,
      endpoint: ctx.endpointCode,
      at: new Date().toString()
    ]
  }
}
$groovy$,
  'PUBLISHED',
  1,
  'Slice lab dynamic echo'
);

INSERT INTO lc_dynamic_endpoint (
  endpoint_code, script_code, perm_code,
  request_schema_json, response_schema_json,
  tx_mode, timeout_ms, enabled, status, remark
) VALUES (
  'ep_slice_echo',
  'groovy_slice_echo',
  NULL,
  '{"type":"object","properties":{"message":{"type":"string"},"n":{"type":"number"}}}'::jsonb,
  '{"type":"object","required":["echo","doubled"],"properties":{"echo":{"type":"string"},"doubled":{"type":"number"}}}'::jsonb,
  'READ_ONLY',
  5000,
  true,
  'PUBLISHED',
  'Slice lab echo endpoint'
);

COMMIT;
