-- =============================================================================
-- 上手 Demo：基础台账 + 联表只读 + JS 改页面 + 动态接口
-- 安装：
--   docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/simple_tour/install.sql
-- 登录 owner/owner123 → 侧栏「上手导览」
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS tour_note CASCADE;
DROP TABLE IF EXISTS tour_category CASCADE;

CREATE TABLE tour_category (
    id    BIGSERIAL PRIMARY KEY,
    code  VARCHAR(40) NOT NULL UNIQUE,
    name  VARCHAR(100) NOT NULL
);

CREATE TABLE tour_note (
    id           BIGSERIAL PRIMARY KEY,
    title        VARCHAR(200) NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'open',
    priority     INTEGER      NOT NULL DEFAULT 1,
    category_id  BIGINT REFERENCES tour_category(id),
    remark       TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO tour_category (code, name) VALUES
  ('learn', '学习'),
  ('ops', '运维'),
  ('idea', '灵感');

INSERT INTO tour_note (title, status, priority, category_id, remark) VALUES
  ('学会打开一个页面', 'open', 1, 1, '侧栏点「上手导览」'),
  ('学会看联表', 'open', 2, 1, '打开「联表只读」页'),
  ('学会筛选', 'open', 1, 1, '标题搜「学会」'),
  ('学会新增/编辑', 'done', 3, 2, '可写页才有按钮'),
  ('点一行：toast + 调动态接口', 'open', 2, 3, 'JS Controller → endpoint.call');

INSERT INTO lc_dict_type (dict_code, name, description) VALUES
  ('tour.note_status', '便签状态', 'simple tour')
ON CONFLICT (dict_code) DO NOTHING;
DELETE FROM lc_dict_item WHERE dict_code = 'tour.note_status';
INSERT INTO lc_dict_item (dict_code, item_value, item_label, sort_order, enabled) VALUES
  ('tour.note_status', 'open', '进行中', 1, true),
  ('tour.note_status', 'done', '已完成', 2, true);

DELETE FROM lc_page_model WHERE page_code IN (
  'simple_tour_guide', 'simple_tour_notes', 'simple_tour_join'
);
DELETE FROM lc_query_model WHERE query_code IN (
  'q_tour_guide', 'q_tour_notes', 'q_tour_join'
);
DELETE FROM lc_entity_model WHERE entity_code = 'entity_tour_note';
DELETE FROM lc_dynamic_endpoint WHERE endpoint_code = 'ep_tour_echo';
DELETE FROM lc_script WHERE script_code IN ('ctrl_tour_notes', 'groovy_tour_echo');
DELETE FROM lc_permission WHERE perm_code IN (
  'page:simple_tour_guide', 'page:simple_tour_notes', 'page:simple_tour_join',
  'query:q_tour_guide', 'query:q_tour_notes', 'query:q_tour_join'
);

-- ---------------------------------------------------------------------------
-- 0) 导览
-- ---------------------------------------------------------------------------
INSERT INTO lc_query_model (query_code, sql_text, query_mode, count_sql_text)
VALUES (
  'q_tour_guide',
  $sql$
SELECT * FROM (VALUES
  (1, '① 基础台账', '侧栏「我的便签」：单表查询 + 筛选 + 增删改', 'simple_tour_notes'),
  (2, '② 联表查询', '侧栏「联表只读」：note JOIN category，只读不可写', 'simple_tour_join'),
  (3, '③ Script 改页面', '在便签页点任意一行 → toast；并调用动态接口', 'ctrl_tour_notes'),
  (4, '④ 动态接口', 'Scripts→端点 ep_tour_echo；或在便签页点行自动调', 'ep_tour_echo'),
  (5, '⑤ 改脚本', 'Scripts 打开 ctrl_tour_notes → 改 onEvent → Publish → 刷新页', 'Scripts'),
  (6, '⑥ 改联表 SQL', 'SQL Repo 打开 q_tour_join 看 JOIN 语句', 'SQL Repo')
) AS t(step_no, title, detail, where_to_go)
ORDER BY step_no
$sql$,
  'rawSql',
  'SELECT 6'
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
    "title": "上手导览 · 联表 / Script / 动态接口",
    "description": "按步骤打开侧栏三个页面即可。先别管多库和权限细节。",
    "badge": "Tour"
  },
  "features": { "create": false, "edit": false, "delete": false },
  "table": {
    "columns": [
      { "field": "step_no", "label": "#", "width": 48 },
      { "field": "title", "label": "能力", "width": 140 },
      { "field": "detail", "label": "怎么点", "width": 420 },
      { "field": "where_to_go", "label": "对应", "width": 160 }
    ],
    "filters": [],
    "actions": []
  }
}
$cfg$::jsonb
);

-- ---------------------------------------------------------------------------
-- 1) 单表可写 + JS Controller（会调动态接口）
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
  {"field":"category_id","label":"分类ID","type":"integer"},
  {"field":"remark","label":"备注","type":"string"}
]
$fields$::jsonb
);

INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, count_sql_text)
VALUES (
  'q_tour_notes',
  'entity_tour_note',
  'SELECT id, title, status, priority, category_id, remark, created_at FROM tour_note',
  'singleTableTemplate',
  'SELECT COUNT(*) FROM tour_note'
);

-- Groovy 动态接口：把 priority 翻倍返回
INSERT INTO lc_script (script_code, script_type, script_content, status, version, remark)
VALUES (
  'groovy_tour_echo',
  'BACKEND_GROOVY',
  $groovy$
import com.example.lowcode.script.IDynamicEndpointHandler
import com.example.lowcode.script.DynamicContext

class TourEcho implements IDynamicEndpointHandler {
  Object handle(DynamicContext ctx) {
    def title = ctx.get('title') ?: ''
    def p = (ctx.get('priority') ?: 0) as int
    return [
      ok: true,
      title: title,
      priority: p,
      doubled: p * 2,
      tip: '这是 Groovy 动态接口 ep_tour_echo 的返回',
      at: new Date().toString()
    ]
  }
}
$groovy$,
  'PUBLISHED',
  1,
  'Tour dynamic echo'
);

INSERT INTO lc_dynamic_endpoint (
  endpoint_code, script_code, perm_code,
  request_schema_json, response_schema_json,
  tx_mode, timeout_ms, enabled, status, remark
) VALUES (
  'ep_tour_echo',
  'groovy_tour_echo',
  NULL,
  '{"type":"object","properties":{"title":{"type":"string"},"priority":{"type":"number"}}}'::jsonb,
  '{"type":"object","required":["ok","doubled"]}'::jsonb,
  'READ_ONLY',
  5000,
  true,
  'PUBLISHED',
  'Tour: double priority'
);

-- JS Controller：点行 → toast + 调动态接口
INSERT INTO lc_script (script_code, script_type, script_content, status, version, page_code, remark)
VALUES (
  'ctrl_tour_notes',
  'PAGE_CONTROLLER',
  $js$
export default {
  async onReady(ctx) {
    ctx.ui.log('info', 'tour notes controller ready', { page: ctx.pageCode });
  },
  async onEvent(event, ctx) {
    if (event.type !== 'rowClick') return;
    const row = event.payload?.row || {};
    const title = row.title || String(row.id || '');
    const priority = Number(row.priority || 0);

    // 1) 改「当前页」交互：toast + 写本地 state
    ctx.state.set('lastTitle', title);
    ctx.ui.toast('点了：' + title + '（正在调动态接口…）');

    // 2) 调后端动态接口 POST /api/v1/dynamic/ep_tour_echo
    try {
      const res = await ctx.endpoint.call('ep_tour_echo', {
        title: title,
        priority: priority
      });
      const doubled = res?.doubled ?? res?.data?.doubled;
      ctx.ui.toast('动态接口返回 doubled=' + doubled + '（' + (res?.tip || '') + '）');
      ctx.state.set('lastEndpointResult', res);
      ctx.ui.log('info', 'ep_tour_echo', res);
    } catch (e) {
      ctx.ui.toast('动态接口失败：' + (e?.message || e));
      ctx.ui.log('error', 'endpoint failed', e);
    }
  }
};
$js$,
  'PUBLISHED',
  1,
  'simple_tour_notes',
  'toast + call ep_tour_echo'
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
    "title": "我的便签 · Script + 动态接口",
    "description": "点任意行：① toast ② 调用 POST /api/v1/dynamic/ep_tour_echo。可在 Scripts 里改 ctrl_tour_notes。",
    "badge": "Script"
  },
  "features": { "create": true, "edit": true, "delete": true },
  "controller": { "scriptCode": "ctrl_tour_notes", "enabled": true },
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 56 },
      { "field": "title", "label": "标题", "width": 200 },
      { "field": "status", "label": "状态", "width": 90, "format": "dict", "dictCode": "tour.note_status" },
      { "field": "priority", "label": "优先级", "width": 80, "format": "number" },
      { "field": "category_id", "label": "分类ID", "width": 80 },
      { "field": "remark", "label": "备注", "width": 200 }
    ],
    "filters": [
      { "field": "title", "label": "标题", "type": "text", "operator": "ilike", "placeholder": "学会" },
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

-- ---------------------------------------------------------------------------
-- 2) 联表只读（JOIN）— 故意不绑 entity / 不开启 CRUD
-- ---------------------------------------------------------------------------
INSERT INTO lc_query_model (query_code, sql_text, query_mode, count_sql_text)
VALUES (
  'q_tour_join',
  $sql$
SELECT
  n.id,
  n.title,
  n.status,
  n.priority,
  c.code  AS category_code,
  c.name  AS category_name,
  n.remark
FROM tour_note n
JOIN tour_category c ON c.id = n.category_id
ORDER BY n.id
$sql$,
  'rawSql',
  $cnt$
SELECT COUNT(*)
FROM tour_note n
JOIN tour_category c ON c.id = n.category_id
$cnt$
);

INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'simple_tour_join',
  '联表只读',
  '/demo/simple-join',
  'q_tour_join',
  NULL,
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "联表只读 · note JOIN category",
    "description": "复杂 SQL 可以分页筛选，但默认不可写（没有 entity / CRUD）。写操作请走单表页或 sqlTransaction。",
    "badge": "JOIN"
  },
  "features": { "create": false, "edit": false, "delete": false },
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 56 },
      { "field": "title", "label": "标题", "width": 180 },
      { "field": "category_name", "label": "分类名", "width": 100 },
      { "field": "category_code", "label": "分类码", "width": 90 },
      { "field": "status", "label": "状态", "width": 90, "format": "dict", "dictCode": "tour.note_status" },
      { "field": "priority", "label": "优先级", "width": 80 },
      { "field": "remark", "label": "备注", "width": 200 }
    ],
    "filters": [
      { "field": "title", "label": "标题", "type": "text", "operator": "ilike" },
      { "field": "category_name", "label": "分类名", "type": "text", "operator": "ilike" }
    ],
    "actions": []
  }
}
$cfg$::jsonb
);

-- 权限
INSERT INTO lc_permission (perm_code, perm_type, resource_code, description) VALUES
  ('page:simple_tour_guide', 'page', 'simple_tour_guide', '上手导览'),
  ('page:simple_tour_notes', 'page', 'simple_tour_notes', '我的便签'),
  ('page:simple_tour_join', 'page', 'simple_tour_join', '联表只读'),
  ('query:q_tour_guide', 'query', 'q_tour_guide', 'tour guide'),
  ('query:q_tour_notes', 'query', 'q_tour_notes', 'tour notes'),
  ('query:q_tour_join', 'query', 'q_tour_join', 'tour join')
ON CONFLICT (perm_code) DO NOTHING;

INSERT INTO lc_role_permission (role_code, perm_code)
SELECT r.role_code, p.perm_code
FROM (VALUES ('owner'), ('clerk')) AS r(role_code)
CROSS JOIN (VALUES
  ('page:simple_tour_guide'),
  ('page:simple_tour_notes'),
  ('page:simple_tour_join'),
  ('query:q_tour_guide'),
  ('query:q_tour_notes'),
  ('query:q_tour_join')
) AS p(perm_code)
ON CONFLICT DO NOTHING;

COMMIT;
