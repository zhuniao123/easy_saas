-- =============================================================================
-- 最简上手 Demo（5 分钟）
-- 只演示：SQL 查表 → 页面 → 筛选 → 可写台账 → 点一下 JS Controller
-- 安装：
--   docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/simple_tour/install.sql
-- 然后用 owner 登录，打开侧栏「上手导览」
-- =============================================================================

BEGIN;

-- 业务表：便签（故意做得很小）
DROP TABLE IF EXISTS tour_note CASCADE;
CREATE TABLE tour_note (
    id          BIGSERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'open',  -- open | done
    priority    INTEGER      NOT NULL DEFAULT 1,       -- 1/2/3
    remark      TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO tour_note (title, status, priority, remark) VALUES
  ('学会打开一个页面', 'open', 1, '从侧栏点「上手导览」'),
  ('学会看表格数据', 'open', 2, '来自 SQL，不是写死的 React'),
  ('学会筛选', 'open', 1, '用标题模糊搜'),
  ('学会新增/编辑', 'done', 3, '可写页才会出现按钮'),
  ('点一行看 toast', 'open', 2, 'JS Controller 演示');

-- 字典：状态（format=dict 用）
INSERT INTO lc_dict_type (dict_code, name, description) VALUES
  ('tour.note_status', '便签状态', 'simple tour')
ON CONFLICT (dict_code) DO NOTHING;

DELETE FROM lc_dict_item WHERE dict_code = 'tour.note_status';
INSERT INTO lc_dict_item (dict_code, item_value, item_label, sort_order, enabled) VALUES
  ('tour.note_status', 'open', '进行中', 1, true),
  ('tour.note_status', 'done', '已完成', 2, true);

-- 清理旧元数据
DELETE FROM lc_page_model WHERE page_code IN ('simple_tour_guide', 'simple_tour_notes');
DELETE FROM lc_query_model WHERE query_code IN ('q_tour_guide', 'q_tour_notes');
DELETE FROM lc_entity_model WHERE entity_code = 'entity_tour_note';
DELETE FROM lc_script WHERE script_code = 'ctrl_tour_notes';
DELETE FROM lc_permission WHERE perm_code IN (
  'page:simple_tour_guide', 'page:simple_tour_notes',
  'query:q_tour_guide', 'query:q_tour_notes'
);

-- ---------------------------------------------------------------------------
-- 1) 导览页：纯 SQL 静态清单（只读）
-- ---------------------------------------------------------------------------
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, count_sql_text)
VALUES (
  'q_tour_guide',
  NULL,
  $sql$
SELECT * FROM (VALUES
  (1, '① 登录', '用 owner / owner123 登录（店员 clerk 也能看导览）', '必做'),
  (2, '② 打开本页', '侧栏点「上手导览」——你已经在这里了', '必做'),
  (3, '③ 打开台账', '侧栏点「我的便签」看真实业务表', '必做'),
  (4, '④ 筛选', '在便签页标题框输入「学会」再点筛选', '体验'),
  (5, '⑤ 新增一行', '点新建，填标题保存（可写页）', '体验'),
  (6, '⑥ 点一行', '点任意行，应弹出 toast（JS Controller）', '体验'),
  (7, '⑦ 看状态中文', 'status 列应显示「进行中/已完成」（字典）', '体验'),
  (8, '⑧ 系统工具（可选）', 'SQL Repo / Scripts / Ops 仅 owner 有', '可选')
) AS t(step_no, title, detail, tag)
ORDER BY step_no
$sql$,
  'rawSql',
  'SELECT 8'
);

INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'simple_tour_guide',
  '上手导览',
  '/demo/simple-tour',
  'q_tour_guide',
  NULL,
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "上手导览 · 5 分钟",
    "description": "先按表格从上到下点一遍。复杂能力（多库/权限/Groovy）先别碰。",
    "badge": "Tour"
  },
  "features": { "create": false, "edit": false, "delete": false },
  "table": {
    "columns": [
      { "field": "step_no", "label": "#", "width": 48 },
      { "field": "title", "label": "步骤", "width": 140 },
      { "field": "detail", "label": "做什么", "width": 420 },
      { "field": "tag", "label": "优先级", "width": 80, "format": "badge" }
    ],
    "filters": [],
    "actions": []
  }
}
$cfg$::jsonb
);

-- ---------------------------------------------------------------------------
-- 2) 便签台账：单表可写 + 筛选 + 字典 + JS Controller
-- ---------------------------------------------------------------------------
INSERT INTO lc_entity_model (entity_code, table_name, primary_key, label_field, fields_json)
VALUES (
  'entity_tour_note',
  'tour_note',
  'id',
  'title',
  $fields$
[
  {"field":"id","label":"ID","type":"integer"},
  {"field":"title","label":"标题","type":"string"},
  {"field":"status","label":"状态","type":"string"},
  {"field":"priority","label":"优先级","type":"integer"},
  {"field":"remark","label":"备注","type":"string"}
]
$fields$::jsonb
);

INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, count_sql_text)
VALUES (
  'q_tour_notes',
  'entity_tour_note',
  'SELECT id, title, status, priority, remark, created_at FROM tour_note',
  'singleTableTemplate',
  'SELECT COUNT(*) FROM tour_note'
);

INSERT INTO lc_script (script_code, script_type, script_content, status, version, page_code, remark)
VALUES (
  'ctrl_tour_notes',
  'PAGE_CONTROLLER',
  $js$
export default {
  async onReady(ctx) {
    ctx.ui.log('info', 'tour notes ready');
  },
  async onEvent(event, ctx) {
    if (event.type === 'rowClick') {
      const row = event.payload?.row || {};
      const title = row.title || row.id || '';
      ctx.ui.toast('你点了：' + title);
    }
  }
};
$js$,
  'PUBLISHED',
  1,
  'simple_tour_notes',
  'Simple tour page controller'
);

INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'simple_tour_notes',
  '我的便签',
  '/demo/simple-notes',
  'q_tour_notes',
  'entity_tour_note',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "我的便签",
    "description": "数据来自表 tour_note。可筛选、可增删改。点行看 toast。",
    "badge": "CRUD"
  },
  "features": { "create": true, "edit": true, "delete": true },
  "controller": { "scriptCode": "ctrl_tour_notes", "enabled": true },
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 64 },
      { "field": "title", "label": "标题", "width": 200 },
      { "field": "status", "label": "状态", "width": 100, "format": "dict", "dictCode": "tour.note_status" },
      { "field": "priority", "label": "优先级", "width": 80, "format": "number" },
      { "field": "remark", "label": "备注", "width": 220 },
      { "field": "created_at", "label": "创建时间", "width": 160, "format": "datetime" }
    ],
    "filters": [
      { "field": "title", "label": "标题", "type": "text", "operator": "ilike", "placeholder": "输入「学会」试试" },
      {
        "field": "status",
        "label": "状态",
        "type": "select",
        "operator": "eq",
        "options": { "source": "dict", "dictCode": "tour.note_status" }
      }
    ],
    "actions": []
  }
}
$cfg$::jsonb
);

-- 权限：owner + clerk 都能看这两页
INSERT INTO lc_permission (perm_code, perm_type, resource_code, description) VALUES
  ('page:simple_tour_guide', 'page', 'simple_tour_guide', '上手导览'),
  ('page:simple_tour_notes', 'page', 'simple_tour_notes', '我的便签'),
  ('query:q_tour_guide', 'query', 'q_tour_guide', 'tour guide'),
  ('query:q_tour_notes', 'query', 'q_tour_notes', 'tour notes')
ON CONFLICT (perm_code) DO NOTHING;

INSERT INTO lc_role_permission (role_code, perm_code)
SELECT r.role_code, p.perm_code
FROM (VALUES ('owner'), ('clerk')) AS r(role_code)
CROSS JOIN (VALUES
  ('page:simple_tour_guide'),
  ('page:simple_tour_notes'),
  ('query:q_tour_guide'),
  ('query:q_tour_notes')
) AS p(perm_code)
ON CONFLICT DO NOTHING;

COMMIT;
