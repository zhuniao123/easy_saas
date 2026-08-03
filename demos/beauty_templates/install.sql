-- Beauty salon frontend templates demo: Workspace / Wizard / Calendar.
-- Pure SQL + page DSL. Plugin I/O (SMS/email/card) is out of scope for this slice.
-- Idempotent.

BEGIN;

DELETE FROM lc_page_model WHERE page_code IN (
  'beauty_tpl_guide', 'beauty_workspace', 'beauty_wizard', 'beauty_calendar'
);
DELETE FROM lc_query_model WHERE query_code IN (
  'q_beauty_guide', 'q_beauty_members', 'q_beauty_appts', 'q_beauty_kpi',
  'q_beauty_cal', 'q_beauty_services'
);
DELETE FROM lc_entity_model WHERE entity_code IN (
  'entity_beauty_guide', 'entity_beauty_members', 'entity_beauty_appts', 'entity_beauty_cal'
);
DELETE FROM lc_script WHERE script_code = 'ctrl_beauty_tpl';

INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES
(
  'entity_beauty_guide', 'lc_page_model', 'step_no',
  '[{"field":"step_no","label":"#","type":"integer"},{"field":"page_ref","label":"页面","type":"string"},{"field":"focus","label":"观察点","type":"string"}]'::jsonb
),
(
  'entity_beauty_members', 'lc_page_model', 'id',
  '[{"field":"id","label":"ID","type":"integer"},{"field":"member_name","label":"会员","type":"string"},{"field":"phone","label":"手机","type":"string"},{"field":"level","label":"等级","type":"string"}]'::jsonb
),
(
  'entity_beauty_appts', 'lc_page_model', 'id',
  '[{"field":"id","label":"ID","type":"integer"},{"field":"member_name","label":"会员","type":"string"},{"field":"service_name","label":"项目","type":"string"},{"field":"staff_name","label":"员工","type":"string"},{"field":"status","label":"状态","type":"string"}]'::jsonb
),
(
  'entity_beauty_cal', 'lc_page_model', 'id',
  '[{"field":"id","label":"ID","type":"integer"},{"field":"title","label":"标题","type":"string"},{"field":"start_at","label":"开始","type":"string"},{"field":"staff_name","label":"员工","type":"string"},{"field":"status","label":"状态","type":"string"}]'::jsonb
);

INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, params_json) VALUES
(
  'q_beauty_guide', 'entity_beauty_guide',
  $sql$
SELECT * FROM (VALUES
  (1, 'beauty_workspace', '三栏：左会员 / 中预约表 / 右 KPI'),
  (2, 'beauty_wizard', '开卡向导：资料 → 套餐 → 确认（完成事件可接 Action/插件）'),
  (3, 'beauty_calendar', '周视图预约日历；点击 itemClick'),
  (4, '插件预留', '短信/邮件/开卡 → SQL 出参 + Groovy/outbox，本切片仅前端模板')
) AS t(step_no, page_ref, focus) ORDER BY step_no
$sql$,
  'rawSql', '[]'::jsonb
),
(
  'q_beauty_members', 'entity_beauty_members',
  $sql$
SELECT * FROM (VALUES
  (1, '小美', '13800001111', '金卡'),
  (2, '阿杰', '13800002222', '银卡'),
  (3, '圆圆', '13800003333', '普卡'),
  (4, '晓雯', '13800004444', '金卡')
) AS t(id, member_name, phone, level)
$sql$,
  'rawSql', '[]'::jsonb
),
(
  'q_beauty_appts', 'entity_beauty_appts',
  $sql$
SELECT * FROM (VALUES
  (1, '小美', '剪发造型', '林发型师', '已预约'),
  (2, '阿杰', '染发', '王技师', '进行中'),
  (3, '圆圆', '护理', '陈顾问', '已完成'),
  (4, '晓雯', '美甲', '赵美甲', '已预约')
) AS t(id, member_name, service_name, staff_name, status)
$sql$,
  'rawSql', '[]'::jsonb
),
(
  'q_beauty_kpi', NULL,
  'SELECT 18::int AS today_appts, 6::int AS walk_ins, 12800::numeric AS card_sales',
  'rawSql', '[]'::jsonb
),
(
  'q_beauty_services', NULL,
  $sql$
SELECT * FROM (VALUES
  ('基础剪发', 88::numeric),
  ('烫染套餐', 680::numeric),
  ('头皮护理', 198::numeric),
  ('年卡开卡', 3600::numeric)
) AS t(service_name, price)
$sql$,
  'rawSql', '[]'::jsonb
),
(
  'q_beauty_cal', 'entity_beauty_cal',
  $sql$
SELECT * FROM (VALUES
  (1, '小美 · 剪发', (CURRENT_DATE + 0)::text || ' 10:00', '林发型师', '已预约'),
  (2, '阿杰 · 染发', (CURRENT_DATE + 1)::text || ' 14:00', '王技师', '已预约'),
  (3, '圆圆 · 护理', (CURRENT_DATE + 2)::text || ' 11:30', '陈顾问', '待确认'),
  (4, '晓雯 · 美甲', (CURRENT_DATE + 3)::text || ' 16:00', '赵美甲', '已预约'),
  (5, '散客 · 洗剪吹', (CURRENT_DATE + 4)::text || ' 09:30', '林发型师', '已预约')
) AS t(id, title, start_at, staff_name, status)
$sql$,
  'rawSql', '[]'::jsonb
);

-- Guide
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'beauty_tpl_guide', '美容美发 · 模板导览', '/demo/beauty-tpl-guide', 'q_beauty_guide', 'entity_beauty_guide',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "美容美发前端模板导览",
    "description": "Workspace / Wizard / Calendar。短信邮件开卡插件后续：SQL+Groovy 输出 → PluginHost。",
    "badge": "Beauty Templates"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": false },
  "table": {
    "columns": [
      { "field": "step_no", "label": "#", "width": 56 },
      { "field": "page_ref", "label": "页面", "width": 180 },
      { "field": "focus", "label": "观察点", "width": 420 }
    ],
    "filters": [], "actions": []
  }
}
$cfg$::jsonb
);

-- Workspace: left members / center appts / right KPI+text
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'beauty_workspace', '美容美发 · 前台工作台', '/demo/beauty-workspace', 'q_beauty_appts', 'entity_beauty_appts',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "前台工作台",
    "description": "三栏 Workspace：会员列表 · 今日预约 · 指标。点行可接 JS controller。",
    "badge": "Workspace"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": true },
  "workspace": {
    "enabled": true,
    "gap": 16,
    "left": {
      "span": 3,
      "title": "会员",
      "description": "q_beauty_members",
      "components": ["member_grid"]
    },
    "center": {
      "span": 6,
      "title": "预约",
      "components": ["appt_grid"]
    },
    "right": {
      "span": 3,
      "title": "今日",
      "components": ["kpi_appts", "kpi_cards", "hint"]
    }
  },
  "components": [
    {
      "componentCode": "member_grid",
      "type": "simpleGrid",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_members" },
      "properties": { "title": "会员", "maxRows": 50 }
    },
    {
      "componentCode": "appt_grid",
      "type": "smartGrid"
    },
    {
      "componentCode": "kpi_appts",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_kpi" },
      "bindings": { "value": "today_appts" },
      "properties": { "title": "今日预约", "format": "number" }
    },
    {
      "componentCode": "kpi_cards",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_kpi" },
      "bindings": { "value": "card_sales" },
      "properties": { "title": "开卡金额", "format": "money" }
    },
    {
      "componentCode": "hint",
      "type": "text",
      "properties": {
        "title": "插件预留",
        "content": "开卡成功后：SQL 查出手机号 → Groovy 组装短信 payload → outbox/PluginHost 发送。本页只做布局。"
      }
    }
  ],
  "controller": { "scriptCode": "ctrl_beauty_tpl", "enabled": true },
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 56 },
      { "field": "member_name", "label": "会员", "width": 100 },
      { "field": "service_name", "label": "项目", "width": 120 },
      { "field": "staff_name", "label": "员工", "width": 100 },
      { "field": "status", "label": "状态", "width": 90, "format": "badge" }
    ],
    "filters": [{ "field": "member_name", "label": "会员", "type": "text" }],
    "actions": []
  }
}
$cfg$::jsonb
);

-- Wizard: open card flow (UI steps)
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'beauty_wizard', '美容美发 · 开卡向导', '/demo/beauty-wizard', 'q_beauty_services', 'entity_beauty_appts',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "会员开卡向导",
    "description": "Wizard 模板：分步收集信息。完成事件可接 Action / Groovy 插件（短信欢迎）。",
    "badge": "Wizard"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": false },
  "wizard": {
    "enabled": true,
    "steps": [
      {
        "code": "profile",
        "title": "会员资料",
        "description": "实际项目用 form 组件或 masterDetail；此处用 text 说明步骤。",
        "components": ["step_profile"]
      },
      {
        "code": "package",
        "title": "选择套餐",
        "description": "套餐列表来自 SQL。",
        "components": ["step_packages"]
      },
      {
        "code": "confirm",
        "title": "确认开卡",
        "description": "完成后发 wizardFinish；可接短信/邮件插件。",
        "components": ["step_confirm"]
      }
    ]
  },
  "components": [
    {
      "componentCode": "step_profile",
      "type": "text",
      "properties": {
        "title": "资料",
        "content": "填写姓名、手机、顾问。字段表单可后续挂 form 组件；权威写入仍走 Action/SQL。"
      }
    },
    {
      "componentCode": "step_packages",
      "type": "smartGrid"
    },
    {
      "componentCode": "step_confirm",
      "type": "text",
      "properties": {
        "title": "确认",
        "content": "点「完成」触发 wizardFinish。插件链：query 取会员手机 → Groovy 渲染模板 → PluginHost.sendSms。"
      }
    }
  ],
  "controller": { "scriptCode": "ctrl_beauty_tpl", "enabled": true },
  "table": {
    "columns": [
      { "field": "service_name", "label": "套餐/项目", "width": 200 },
      { "field": "price", "label": "价格", "width": 100, "format": "money", "align": "right" }
    ],
    "filters": [],
    "actions": []
  }
}
$cfg$::jsonb
);

-- Calendar
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'beauty_calendar', '美容美发 · 预约日历', '/demo/beauty-calendar', 'q_beauty_cal', 'entity_beauty_cal',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "预约周视图",
    "description": "calendar 组件：SQL 行 → id/title/start/resource/status。点击 itemClick。",
    "badge": "Calendar"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": false },
  "components": [
    {
      "componentCode": "week_cal",
      "type": "calendar",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_cal" },
      "bindings": {
        "id": "id",
        "title": "title",
        "start": "start_at",
        "resourceId": "staff_name",
        "status": "status"
      },
      "properties": { "title": "本周预约", "days": 7, "height": 480 }
    },
    {
      "componentCode": "hint",
      "type": "text",
      "properties": {
        "title": "扩展",
        "content": "拖拽改期后续：itemMove → Action/Dynamic Endpoint。提醒短信走插件，不在日历组件内发 HTTP。"
      }
    }
  ],
  "controller": { "scriptCode": "ctrl_beauty_tpl", "enabled": true },
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 56 },
      { "field": "title", "label": "标题", "width": 200 },
      { "field": "start_at", "label": "开始", "width": 160 },
      { "field": "staff_name", "label": "员工", "width": 100 },
      { "field": "status", "label": "状态", "width": 90 }
    ],
    "filters": [],
    "actions": []
  }
}
$cfg$::jsonb
);

INSERT INTO lc_script (script_code, script_type, script_content, status, version, page_code, remark)
VALUES (
  'ctrl_beauty_tpl',
  'PAGE_CONTROLLER',
  $js$
export default {
  async onReady(ctx) {
    ctx.ui.log('info', 'beauty template controller ready', { page: ctx.pageCode });
  },
  async onEvent(event, ctx) {
    if (event.type === 'rowClick' || event.type === 'itemClick' || event.type === 'wizardFinish') {
      const name = event.payload?.title || event.payload?.name
        || event.payload?.row?.member_name || event.payload?.row?.service_name
        || event.componentCode;
      ctx.ui.toast(event.type + ': ' + name);
      ctx.ui.log('info', 'beauty event', event);
    }
  }
};
$js$,
  'PUBLISHED',
  1,
  NULL,
  'Beauty template pages controller'
);

COMMIT;
