-- Beauty salon business demo: real tables + workspace + masterDetail order + calendar.
-- Complements frontend templates; SMS/email/card plugins still reserved.
-- Idempotent.

BEGIN;

-- ---------------------------------------------------------------------------
-- Physical tables
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS beauty_order_line CASCADE;
DROP TABLE IF EXISTS beauty_order CASCADE;
DROP TABLE IF EXISTS beauty_appointment CASCADE;
DROP TABLE IF EXISTS beauty_member_card CASCADE;
DROP TABLE IF EXISTS beauty_card_product CASCADE;
DROP TABLE IF EXISTS beauty_service CASCADE;
DROP TABLE IF EXISTS beauty_staff CASCADE;
DROP TABLE IF EXISTS beauty_member CASCADE;

CREATE TABLE beauty_member (
  id            SERIAL PRIMARY KEY,
  member_code   VARCHAR(40) NOT NULL UNIQUE,
  member_name   VARCHAR(100) NOT NULL,
  phone         VARCHAR(30) NOT NULL DEFAULT '',
  level_code    VARCHAR(20) NOT NULL DEFAULT 'normal',
  balance       NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        INTEGER NOT NULL DEFAULT 1,
  remark        VARCHAR(500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE beauty_staff (
  id            SERIAL PRIMARY KEY,
  staff_code    VARCHAR(40) NOT NULL UNIQUE,
  staff_name    VARCHAR(80) NOT NULL,
  role_name     VARCHAR(40) NOT NULL DEFAULT '技师',
  status        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE beauty_service (
  id            SERIAL PRIMARY KEY,
  service_code  VARCHAR(40) NOT NULL UNIQUE,
  service_name  VARCHAR(120) NOT NULL,
  category      VARCHAR(40) NOT NULL DEFAULT '基础',
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  duration_min  INTEGER NOT NULL DEFAULT 60,
  status        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE beauty_card_product (
  id            SERIAL PRIMARY KEY,
  product_code  VARCHAR(40) NOT NULL UNIQUE,
  product_name  VARCHAR(120) NOT NULL,
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  gift_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_days    INTEGER NOT NULL DEFAULT 365,
  status        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE beauty_member_card (
  id            SERIAL PRIMARY KEY,
  card_no       VARCHAR(40) NOT NULL UNIQUE,
  member_id     INTEGER NOT NULL REFERENCES beauty_member(id),
  product_id    INTEGER NOT NULL REFERENCES beauty_card_product(id),
  balance       NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expire_at     DATE
);

CREATE TABLE beauty_appointment (
  id            SERIAL PRIMARY KEY,
  member_id     INTEGER REFERENCES beauty_member(id),
  member_name   VARCHAR(100) NOT NULL DEFAULT '',
  service_id    INTEGER REFERENCES beauty_service(id),
  service_name  VARCHAR(120) NOT NULL DEFAULT '',
  staff_id      INTEGER REFERENCES beauty_staff(id),
  staff_name    VARCHAR(80) NOT NULL DEFAULT '',
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ,
  status        VARCHAR(30) NOT NULL DEFAULT 'booked',
  remark        VARCHAR(500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE beauty_order (
  id            SERIAL PRIMARY KEY,
  order_no      VARCHAR(40) NOT NULL UNIQUE,
  member_id     INTEGER REFERENCES beauty_member(id),
  member_name   VARCHAR(100) NOT NULL DEFAULT '',
  status        VARCHAR(30) NOT NULL DEFAULT 'draft',
  remark        VARCHAR(500),
  version       INTEGER NOT NULL DEFAULT 1,
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE beauty_order_line (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES beauty_order(id) ON DELETE CASCADE,
  service_name  VARCHAR(120) NOT NULL DEFAULT '',
  staff_name    VARCHAR(80) NOT NULL DEFAULT '',
  qty           NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_beauty_appt_start ON beauty_appointment(start_at);
CREATE INDEX idx_beauty_order_line_oid ON beauty_order_line(order_id);

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
INSERT INTO beauty_member (member_code, member_name, phone, level_code, balance, remark) VALUES
  ('M001', '小美', '13800001111', 'gold', 1200, '老客'),
  ('M002', '阿杰', '13800002222', 'silver', 300, NULL),
  ('M003', '圆圆', '13800003333', 'normal', 0, NULL),
  ('M004', '晓雯', '13800004444', 'gold', 800, NULL),
  ('M005', '阿强', '13800005555', 'normal', 50, NULL);

INSERT INTO beauty_staff (staff_code, staff_name, role_name) VALUES
  ('S01', '林发型师', '发型师'),
  ('S02', '王技师', '烫染'),
  ('S03', '陈顾问', '顾问'),
  ('S04', '赵美甲', '美甲');

INSERT INTO beauty_service (service_code, service_name, category, price, duration_min) VALUES
  ('SVC01', '洗剪吹', '基础', 88, 45),
  ('SVC02', '精剪造型', '基础', 128, 60),
  ('SVC03', '染发套餐', '烫染', 680, 150),
  ('SVC04', '头皮护理', '护理', 198, 60),
  ('SVC05', '美甲基础', '美甲', 98, 50);

INSERT INTO beauty_card_product (product_code, product_name, price, gift_amount, valid_days) VALUES
  ('CARD_Y1', '年卡 3000 送 300', 3000, 300, 365),
  ('CARD_H1', '半年卡 1500 送 100', 1500, 100, 180),
  ('CARD_Q1', '季卡 800 送 50', 800, 50, 90);

INSERT INTO beauty_appointment (member_id, member_name, service_id, service_name, staff_id, staff_name, start_at, end_at, status)
SELECT m.id, m.member_name, s.id, s.service_name, st.id, st.staff_name,
       (CURRENT_DATE + offs.d) + offs.t,
       (CURRENT_DATE + offs.d) + offs.t + (s.duration_min || ' minutes')::interval,
       offs.st
FROM (VALUES
  ('M001', 'SVC02', 'S01', 0, TIME '10:00', 'booked'),
  ('M002', 'SVC03', 'S02', 0, TIME '14:00', 'in_service'),
  ('M003', 'SVC04', 'S03', 1, TIME '11:30', 'booked'),
  ('M004', 'SVC05', 'S04', 2, TIME '16:00', 'booked'),
  ('M001', 'SVC01', 'S01', 3, TIME '09:30', 'booked'),
  ('M005', 'SVC02', 'S01', 4, TIME '15:00', 'booked')
) AS offs(mc, sc, stc, d, t, st)
JOIN beauty_member m ON m.member_code = offs.mc
JOIN beauty_service s ON s.service_code = offs.sc
JOIN beauty_staff st ON st.staff_code = offs.stc;

INSERT INTO beauty_order (order_no, member_id, member_name, status, remark, version, total_amount)
SELECT 'BO-DEMO-1', id, member_name, 'draft', '演示草稿单', 1, 216
FROM beauty_member WHERE member_code = 'M001';

INSERT INTO beauty_order_line (order_id, service_name, staff_name, qty, unit_price, amount)
SELECT o.id, '精剪造型', '林发型师', 1, 128, 128 FROM beauty_order o WHERE o.order_no = 'BO-DEMO-1'
UNION ALL
SELECT o.id, '洗剪吹', '林发型师', 1, 88, 88 FROM beauty_order o WHERE o.order_no = 'BO-DEMO-1';

-- ---------------------------------------------------------------------------
-- Meta cleanup (pages → queries → entities; respect FKs)
-- ---------------------------------------------------------------------------
DELETE FROM lc_page_model WHERE page_code IN (
  'beauty_salon_guide', 'beauty_front_desk', 'beauty_members', 'beauty_services',
  'beauty_order_md', 'beauty_calendar_biz', 'beauty_card_wizard',
  'beauty_tpl_guide', 'beauty_workspace', 'beauty_wizard', 'beauty_calendar'
);
DELETE FROM lc_query_model WHERE query_code LIKE 'q_beauty_%';
DELETE FROM lc_entity_model WHERE entity_code LIKE 'entity_beauty_%';
DELETE FROM lc_script WHERE script_code IN ('ctrl_beauty_salon', 'ctrl_beauty_tpl');

-- ---------------------------------------------------------------------------
-- Entities
-- ---------------------------------------------------------------------------
INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES
(
  'entity_beauty_salon_guide', 'lc_page_model', 'step_no',
  '[{"field":"step_no","label":"#","type":"integer"},{"field":"page_ref","label":"页面","type":"string"},{"field":"focus","label":"说明","type":"string"}]'::jsonb
),
(
  'entity_beauty_member', 'beauty_member', 'id',
  $f$[
    {"field":"id","label":"ID","type":"integer"},
    {"field":"member_code","label":"编码","type":"string"},
    {"field":"member_name","label":"姓名","type":"string"},
    {"field":"phone","label":"手机","type":"string"},
    {"field":"level_code","label":"等级","type":"string"},
    {"field":"balance","label":"余额","type":"number"},
    {"field":"status","label":"状态","type":"integer"},
    {"field":"remark","label":"备注","type":"string"}
  ]$f$::jsonb
),
(
  'entity_beauty_service', 'beauty_service', 'id',
  $f$[
    {"field":"id","label":"ID","type":"integer"},
    {"field":"service_code","label":"编码","type":"string"},
    {"field":"service_name","label":"项目","type":"string"},
    {"field":"category","label":"分类","type":"string"},
    {"field":"price","label":"价格","type":"number"},
    {"field":"duration_min","label":"时长(分)","type":"integer"},
    {"field":"status","label":"状态","type":"integer"}
  ]$f$::jsonb
),
(
  'entity_beauty_order', 'beauty_order', 'id',
  $f$[
    {"field":"id","label":"ID","type":"integer"},
    {"field":"order_no","label":"单号","type":"string"},
    {"field":"member_name","label":"会员","type":"string"},
    {"field":"status","label":"状态","type":"string"},
    {"field":"remark","label":"备注","type":"string"},
    {"field":"version","label":"版本","type":"integer"},
    {"field":"total_amount","label":"合计","type":"number"}
  ]$f$::jsonb
),
(
  'entity_beauty_order_line', 'beauty_order_line', 'id',
  $f$[
    {"field":"id","label":"ID","type":"integer"},
    {"field":"order_id","label":"订单","type":"integer"},
    {"field":"service_name","label":"项目","type":"string"},
    {"field":"staff_name","label":"员工","type":"string"},
    {"field":"qty","label":"数量","type":"number"},
    {"field":"unit_price","label":"单价","type":"number"},
    {"field":"amount","label":"金额","type":"number"}
  ]$f$::jsonb
),
(
  'entity_beauty_appt', 'beauty_appointment', 'id',
  $f$[
    {"field":"id","label":"ID","type":"integer"},
    {"field":"member_name","label":"会员","type":"string"},
    {"field":"service_name","label":"项目","type":"string"},
    {"field":"staff_name","label":"员工","type":"string"},
    {"field":"start_at","label":"开始","type":"datetime"},
    {"field":"status","label":"状态","type":"string"}
  ]$f$::jsonb
);

-- ---------------------------------------------------------------------------
-- Queries
-- ---------------------------------------------------------------------------
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, params_json) VALUES
(
  'q_beauty_salon_guide', 'entity_beauty_salon_guide',
  $sql$
SELECT * FROM (VALUES
  (1, 'beauty_front_desk', '前台工作台：真实会员 + 今日预约 + KPI'),
  (2, 'beauty_order_md', '服务开单 masterDetail：草稿/整单提交'),
  (3, 'beauty_members', '会员台账 singleTable CRUD'),
  (4, 'beauty_services', '项目价目表 CRUD'),
  (5, 'beauty_calendar_biz', '预约日历（真表）'),
  (6, 'beauty_card_wizard', '开卡向导（卡项来自 beauty_card_product）')
) AS t(step_no, page_ref, focus) ORDER BY step_no
$sql$, 'rawSql', '[]'::jsonb
),
(
  'q_beauty_members_biz', 'entity_beauty_member',
  'SELECT id, member_code, member_name, phone, level_code, balance, status, remark, created_at FROM beauty_member WHERE status = 1 ORDER BY id',
  'singleTableTemplate', '[]'::jsonb
),
(
  'q_beauty_services_biz', 'entity_beauty_service',
  'SELECT id, service_code, service_name, category, price, duration_min, status FROM beauty_service ORDER BY id',
  'singleTableTemplate', '[]'::jsonb
),
(
  'q_beauty_appts_biz', 'entity_beauty_appt',
  $sql$
SELECT id, member_name, service_name, staff_name, start_at, status, remark
FROM beauty_appointment
WHERE start_at::date >= CURRENT_DATE - 1
ORDER BY start_at
$sql$,
  'rawSql', '[]'::jsonb
),
(
  'q_beauty_kpi_biz', NULL,
  $sql$
SELECT
  (SELECT COUNT(*)::int FROM beauty_appointment WHERE start_at::date = CURRENT_DATE) AS today_appts,
  (SELECT COUNT(*)::int FROM beauty_member WHERE status = 1) AS members,
  (SELECT COALESCE(SUM(total_amount),0) FROM beauty_order WHERE status = 'submitted' AND created_at::date = CURRENT_DATE) AS sales_today,
  (SELECT COUNT(*)::int FROM beauty_order WHERE status = 'draft') AS draft_orders
$sql$,
  'rawSql', '[]'::jsonb
),
(
  'q_beauty_cal_biz', 'entity_beauty_appt',
  $sql$
SELECT id,
       (member_name || ' · ' || service_name) AS title,
       to_char(start_at, 'YYYY-MM-DD HH24:MI') AS start_at,
       staff_name,
       status
FROM beauty_appointment
WHERE start_at >= CURRENT_DATE - 1
  AND start_at < CURRENT_DATE + 14
ORDER BY start_at
$sql$,
  'rawSql', '[]'::jsonb
),
(
  'q_beauty_order_list', 'entity_beauty_order',
  'SELECT id, order_no, member_name, status, version, total_amount, remark, created_at FROM beauty_order ORDER BY id DESC',
  'rawSql', '[]'::jsonb
),
(
  'q_beauty_order_header', 'entity_beauty_order',
  'SELECT id, order_no, member_id, member_name, status, version, total_amount, remark FROM beauty_order WHERE id = CAST(:id AS INTEGER)',
  'rawSql', '[{"name":"id","type":"integer"}]'::jsonb
),
(
  'q_beauty_order_lines', 'entity_beauty_order_line',
  'SELECT id, order_id, service_name, staff_name, qty, unit_price, amount FROM beauty_order_line WHERE order_id = CAST(:id AS INTEGER) ORDER BY id',
  'rawSql', '[{"name":"id","type":"integer"}]'::jsonb
),
(
  'q_beauty_card_products', NULL,
  'SELECT id, product_code, product_name, price, gift_amount, valid_days FROM beauty_card_product WHERE status = 1 ORDER BY id',
  'rawSql', '[]'::jsonb
);

-- ---------------------------------------------------------------------------
-- Pages
-- ---------------------------------------------------------------------------
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
(
  'beauty_salon_guide', '美发店 · 业务导览', '/demo/beauty-salon-guide', 'q_beauty_salon_guide', 'entity_beauty_salon_guide',
  $cfg${
  "version": 1,
  "presentation": {
    "title": "美容美发业务导览",
    "description": "真实表 beauty_*：会员/项目/预约/开单/卡项。工作台 + 主从开单 + 日历 + 开卡向导。",
    "badge": "Beauty Salon"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": false },
  "table": {
    "columns": [
      { "field": "step_no", "label": "#", "width": 56 },
      { "field": "page_ref", "label": "页面", "width": 200 },
      { "field": "focus", "label": "说明", "width": 480 }
    ],
    "filters": [], "actions": []
  }
}$cfg$::jsonb
),
(
  'beauty_front_desk', '美发店 · 前台工作台', '/demo/beauty-front-desk', 'q_beauty_appts_biz', 'entity_beauty_appt',
  $cfg${
  "version": 1,
  "presentation": {
    "title": "前台工作台",
    "description": "左会员（真表）· 中预约 · 右 KPI。开单请打开 beauty_order_md。",
    "badge": "Workspace"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": true },
  "workspace": {
    "enabled": true,
    "gap": 16,
    "left": { "span": 3, "title": "会员", "components": ["member_list"] },
    "center": { "span": 6, "title": "预约/到店", "components": ["appt_grid"] },
    "right": { "span": 3, "title": "今日", "components": ["kpi_appts", "kpi_members", "kpi_drafts", "nav_hint"] }
  },
  "components": [
    {
      "componentCode": "member_list",
      "type": "simpleGrid",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_members_biz" },
      "properties": { "title": "在册会员", "maxRows": 30 }
    },
    { "componentCode": "appt_grid", "type": "smartGrid" },
    {
      "componentCode": "kpi_appts",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_kpi_biz" },
      "bindings": { "value": "today_appts" },
      "properties": { "title": "今日预约", "format": "number" }
    },
    {
      "componentCode": "kpi_members",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_kpi_biz" },
      "bindings": { "value": "members" },
      "properties": { "title": "会员数", "format": "number" }
    },
    {
      "componentCode": "kpi_drafts",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_kpi_biz" },
      "bindings": { "value": "draft_orders" },
      "properties": { "title": "草稿开单", "format": "number" }
    },
    {
      "componentCode": "nav_hint",
      "type": "text",
      "properties": {
        "title": "快捷",
        "content": "开单 → beauty_order_md · 日历 → beauty_calendar_biz · 开卡 → beauty_card_wizard · 会员台账 → beauty_members"
      }
    }
  ],
  "controller": { "scriptCode": "ctrl_beauty_salon", "enabled": true },
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 56 },
      { "field": "member_name", "label": "会员", "width": 90 },
      { "field": "service_name", "label": "项目", "width": 110 },
      { "field": "staff_name", "label": "员工", "width": 90 },
      { "field": "start_at", "label": "时间", "width": 150, "format": "datetime" },
      { "field": "status", "label": "状态", "width": 90, "format": "badge" }
    ],
    "filters": [
      { "field": "member_name", "label": "会员", "type": "text" },
      { "field": "status", "label": "状态", "type": "text" }
    ],
    "actions": [
      {
        "code": "open_order",
        "label": "去开单",
        "type": "openPage",
        "scope": "page",
        "variant": "primary",
        "openPage": { "pageCode": "beauty_order_md", "title": "服务开单" }
      },
      {
        "code": "open_calendar",
        "label": "日历",
        "type": "openPage",
        "scope": "page",
        "variant": "secondary",
        "openPage": { "pageCode": "beauty_calendar_biz", "title": "预约日历" }
      }
    ]
  }
}$cfg$::jsonb
),
(
  'beauty_members', '美发店 · 会员台账', '/demo/beauty-members', 'q_beauty_members_biz', 'entity_beauty_member',
  $cfg${
  "version": 1,
  "presentation": {
    "title": "会员台账",
    "description": "singleTableTemplate 可写：增删改会员。",
    "badge": "CRUD"
  },
  "features": { "create": true, "edit": true, "delete": true, "pagination": true },
  "table": {
    "columns": [
      { "field": "id", "label": "ID", "width": 56 },
      { "field": "member_code", "label": "编码", "width": 90 },
      { "field": "member_name", "label": "姓名", "width": 100 },
      { "field": "phone", "label": "手机", "width": 120 },
      { "field": "level_code", "label": "等级", "width": 80, "format": "badge" },
      { "field": "balance", "label": "余额", "width": 90, "format": "money", "align": "right" },
      { "field": "status", "label": "状态", "width": 70 }
    ],
    "filters": [
      { "field": "member_name", "label": "姓名", "type": "text" },
      { "field": "phone", "label": "手机", "type": "text" }
    ],
    "actions": [
      { "code": "create", "label": "新增", "dsl": "record.create", "scope": "page", "variant": "success" },
      { "code": "refresh_grid", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary" }
    ]
  }
}$cfg$::jsonb
),
(
  'beauty_services', '美发店 · 项目价目', '/demo/beauty-services', 'q_beauty_services_biz', 'entity_beauty_service',
  $cfg${
  "version": 1,
  "presentation": {
    "title": "项目价目表",
    "description": "服务项目可维护，开单明细引用名称/单价。",
    "badge": "CRUD"
  },
  "features": { "create": true, "edit": true, "delete": true, "pagination": true },
  "table": {
    "columns": [
      { "field": "service_code", "label": "编码", "width": 90 },
      { "field": "service_name", "label": "项目", "width": 140 },
      { "field": "category", "label": "分类", "width": 90 },
      { "field": "price", "label": "价格", "width": 90, "format": "money", "align": "right" },
      { "field": "duration_min", "label": "时长", "width": 70 }
    ],
    "filters": [{ "field": "service_name", "label": "项目", "type": "text" }],
    "actions": [
      { "code": "create", "label": "新增", "dsl": "record.create", "scope": "page", "variant": "success" }
    ]
  }
}$cfg$::jsonb
),
(
  'beauty_order_md', '美发店 · 服务开单', '/demo/beauty-order', 'q_beauty_order_list', 'entity_beauty_order',
  $cfg${
  "version": 1,
  "presentation": {
    "title": "服务开单（主从）",
    "description": "头：单号/会员；行：项目+员工+数量单价。整单事务保存/提交。",
    "badge": "MasterDetail"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": true },
  "masterDetail": {
    "enabled": true,
    "title": "服务订单",
    "draftStatus": "draft",
    "submitStatus": "submitted",
    "header": {
      "entityCode": "entity_beauty_order",
      "primaryKey": "id",
      "versionField": "version",
      "statusField": "status",
      "requiredMemberField": "member_name",
      "loadQueryCode": "q_beauty_order_header",
      "fields": [
        { "field": "order_no", "label": "单号", "type": "string", "required": true },
        { "field": "member_name", "label": "会员", "type": "string", "required": true },
        { "field": "status", "label": "状态", "type": "string", "readOnly": true },
        { "field": "version", "label": "版本", "type": "integer", "readOnly": true },
        { "field": "remark", "label": "备注", "type": "string" }
      ]
    },
    "lines": {
      "entityCode": "entity_beauty_order_line",
      "primaryKey": "id",
      "fkField": "order_id",
      "loadQueryCode": "q_beauty_order_lines",
      "fields": [
        { "field": "service_name", "label": "项目", "type": "string" },
        { "field": "staff_name", "label": "员工", "type": "string" },
        { "field": "qty", "label": "数量", "type": "number" },
        { "field": "unit_price", "label": "单价", "type": "number" },
        { "field": "amount", "label": "金额", "type": "number", "readOnly": true, "computed": true }
      ]
    }
  },
  "table": {
    "columns": [
      { "field": "order_no", "label": "单号", "width": 120 },
      { "field": "member_name", "label": "会员", "width": 100 },
      { "field": "status", "label": "状态", "width": 90, "format": "badge" },
      { "field": "total_amount", "label": "合计", "width": 90, "format": "money" },
      { "field": "version", "label": "版本", "width": 64 }
    ],
    "filters": [
      { "field": "member_name", "label": "会员", "type": "text" },
      { "field": "status", "label": "状态", "type": "text" }
    ],
    "actions": [
      {
        "code": "back_desk",
        "label": "回工作台",
        "type": "openPage",
        "scope": "page",
        "variant": "secondary",
        "openPage": { "pageCode": "beauty_front_desk", "title": "前台工作台" }
      }
    ]
  }
}$cfg$::jsonb
),
(
  'beauty_calendar_biz', '美发店 · 预约日历', '/demo/beauty-calendar-biz', 'q_beauty_cal_biz', 'entity_beauty_appt',
  $cfg${
  "version": 1,
  "presentation": {
    "title": "预约日历",
    "description": "数据来自 beauty_appointment。点击 itemClick。",
    "badge": "Calendar"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": false },
  "components": [
    {
      "componentCode": "week_cal",
      "type": "calendar",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_cal_biz" },
      "bindings": {
        "id": "id",
        "title": "title",
        "start": "start_at",
        "resourceId": "staff_name",
        "status": "status"
      },
      "properties": { "title": "近两周预约", "days": 7, "height": 480 }
    }
  ],
  "controller": { "scriptCode": "ctrl_beauty_salon", "enabled": true },
  "table": {
    "columns": [
      { "field": "title", "label": "标题", "width": 200 },
      { "field": "start_at", "label": "开始", "width": 160 },
      { "field": "staff_name", "label": "员工", "width": 100 },
      { "field": "status", "label": "状态", "width": 90 }
    ],
    "filters": [], "actions": []
  }
}$cfg$::jsonb
),
(
  'beauty_card_wizard', '美发店 · 开卡向导', '/demo/beauty-card-wizard', 'q_beauty_card_products', NULL,
  $cfg${
  "version": 1,
  "presentation": {
    "title": "会员开卡向导",
    "description": "步骤 UI + 真卡项列表。完成事件预留短信插件（SQL 出手机号 + Groovy）。",
    "badge": "Wizard"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": false },
  "wizard": {
    "enabled": true,
    "steps": [
      {
        "code": "member",
        "title": "选择/填写会员",
        "description": "生产环境可绑定会员选择器；现用说明 + 会员列表参考。",
        "components": ["step_member_hint", "step_member_list"]
      },
      {
        "code": "product",
        "title": "选择卡项",
        "description": "beauty_card_product 真数据。",
        "components": ["step_products"]
      },
      {
        "code": "confirm",
        "title": "确认开卡",
        "description": "完成后可接 Action 写 beauty_member_card + 短信插件。",
        "components": ["step_confirm"]
      }
    ]
  },
  "components": [
    {
      "componentCode": "step_member_hint",
      "type": "text",
      "properties": {
        "title": "会员",
        "content": "从左侧工作台或会员台账选定会员后开卡。插件：开卡成功 → query 手机号 → Groovy 短信模板。"
      }
    },
    {
      "componentCode": "step_member_list",
      "type": "simpleGrid",
      "dataSource": { "type": "sql", "queryCode": "q_beauty_members_biz" },
      "properties": { "title": "可选会员", "maxRows": 20 }
    },
    { "componentCode": "step_products", "type": "smartGrid" },
    {
      "componentCode": "step_confirm",
      "type": "text",
      "properties": {
        "title": "确认",
        "content": "点完成触发 wizardFinish。下一步：sqlTransaction 插入 beauty_member_card，outbox 发短信。"
      }
    }
  ],
  "controller": { "scriptCode": "ctrl_beauty_salon", "enabled": true },
  "table": {
    "columns": [
      { "field": "product_code", "label": "编码", "width": 100 },
      { "field": "product_name", "label": "卡项", "width": 200 },
      { "field": "price", "label": "售价", "width": 90, "format": "money" },
      { "field": "gift_amount", "label": "赠送", "width": 90, "format": "money" },
      { "field": "valid_days", "label": "有效天", "width": 80 }
    ],
    "filters": [], "actions": []
  }
}$cfg$::jsonb
);

INSERT INTO lc_script (script_code, script_type, script_content, status, version, page_code, remark)
VALUES (
  'ctrl_beauty_salon',
  'PAGE_CONTROLLER',
  $js$
export default {
  async onReady(ctx) {
    ctx.ui.log('info', 'beauty salon ready', { page: ctx.pageCode });
  },
  async onEvent(event, ctx) {
    if (event.type === 'rowClick' || event.type === 'itemClick' || event.type === 'wizardFinish') {
      const name = event.payload?.title || event.payload?.name
        || event.payload?.row?.member_name || event.payload?.row?.service_name
        || event.payload?.row?.product_name || event.componentCode;
      ctx.ui.toast(event.type + ': ' + name);
    }
  }
};
$js$,
  'PUBLISHED', 1, NULL, 'Beauty salon business pages'
);

-- Ensure owner can open pages when auth on (best-effort)
INSERT INTO lc_permission (perm_code, perm_type, resource_code, description)
SELECT 'page:' || p.page_code, 'page', p.page_code, 'Page ' || p.page_code
FROM (VALUES
  ('beauty_salon_guide'),('beauty_front_desk'),('beauty_members'),('beauty_services'),
  ('beauty_order_md'),('beauty_calendar_biz'),('beauty_card_wizard')
) AS p(page_code)
ON CONFLICT (perm_code) DO NOTHING;

INSERT INTO lc_permission (perm_code, perm_type, resource_code, description)
SELECT 'query:' || q, 'query', q, 'Query ' || q
FROM (VALUES
  ('q_beauty_salon_guide'),('q_beauty_members_biz'),('q_beauty_services_biz'),
  ('q_beauty_appts_biz'),('q_beauty_kpi_biz'),('q_beauty_cal_biz'),
  ('q_beauty_order_list'),('q_beauty_order_header'),('q_beauty_order_lines'),
  ('q_beauty_card_products')
) AS t(q)
ON CONFLICT (perm_code) DO NOTHING;

INSERT INTO lc_role_permission (role_code, perm_code)
SELECT 'owner', perm_code FROM lc_permission
WHERE perm_code LIKE 'page:beauty_%' OR perm_code LIKE 'query:q_beauty_%'
ON CONFLICT DO NOTHING;

COMMIT;
