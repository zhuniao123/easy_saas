-- Master-detail demo (Slice 8): header + lines, whole-order draft/submit in one TX.
-- Idempotent.

BEGIN;

DROP TABLE IF EXISTS md_order_line CASCADE;
DROP TABLE IF EXISTS md_order CASCADE;

CREATE TABLE md_order (
  id            SERIAL PRIMARY KEY,
  order_no      VARCHAR(40) NOT NULL,
  member_name   VARCHAR(100) NOT NULL DEFAULT '',
  status        VARCHAR(30) NOT NULL DEFAULT 'draft',
  remark        VARCHAR(500),
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE md_order_line (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES md_order(id) ON DELETE CASCADE,
  service_name  VARCHAR(120) NOT NULL DEFAULT '',
  staff_name    VARCHAR(80) NOT NULL DEFAULT '',
  qty           NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_md_order_line_order ON md_order_line(order_id);

DELETE FROM lc_page_model WHERE page_code IN ('md_order_workbench', 'md_order_guide');
DELETE FROM lc_query_model WHERE query_code IN (
  'q_md_order_list', 'q_md_order_header', 'q_md_order_lines', 'q_md_order_guide'
);
DELETE FROM lc_entity_model WHERE entity_code IN (
  'entity_md_order', 'entity_md_order_line', 'entity_md_order_guide'
);

INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES
(
  'entity_md_order', 'md_order', 'id',
  $f$[
    {"field":"id","label":"ID","type":"integer"},
    {"field":"order_no","label":"单号","type":"string"},
    {"field":"member_name","label":"会员","type":"string"},
    {"field":"status","label":"状态","type":"string"},
    {"field":"remark","label":"备注","type":"string"},
    {"field":"version","label":"版本","type":"integer"},
    {"field":"created_at","label":"创建","type":"datetime"},
    {"field":"updated_at","label":"更新","type":"datetime"}
  ]$f$::jsonb
),
(
  'entity_md_order_line', 'md_order_line', 'id',
  $f$[
    {"field":"id","label":"ID","type":"integer"},
    {"field":"order_id","label":"订单ID","type":"integer"},
    {"field":"service_name","label":"项目","type":"string"},
    {"field":"staff_name","label":"员工","type":"string"},
    {"field":"qty","label":"数量","type":"number"},
    {"field":"unit_price","label":"单价","type":"number"},
    {"field":"amount","label":"金额","type":"number"}
  ]$f$::jsonb
),
(
  'entity_md_order_guide', 'lc_page_model', 'step_no',
  '[{"field":"step_no","label":"#","type":"integer"},{"field":"topic","label":"主题","type":"string"},{"field":"hint","label":"说明","type":"string"}]'::jsonb
);

INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, params_json)
VALUES
(
  'q_md_order_guide',
  'entity_md_order_guide',
  $sql$
SELECT * FROM (VALUES
  (1, '打开 md_order_workbench', '新建 → 填会员 → 加多行项目/员工 → 保存草稿'),
  (2, '整单提交', '同一事务写头+行；提交后只读'),
  (3, '乐观锁', 'header.version；并发修改会 CONFLICT'),
  (4, 'API', 'POST /api/v1/pages/{page}/master-detail/save')
) AS t(step_no, topic, hint)
ORDER BY step_no
$sql$,
  'rawSql',
  '[]'::jsonb
),
(
  'q_md_order_list',
  'entity_md_order',
  'SELECT id, order_no, member_name, status, version, remark, created_at, updated_at FROM md_order ORDER BY id DESC',
  'rawSql',
  '[]'::jsonb
),
(
  'q_md_order_header',
  'entity_md_order',
  'SELECT id, order_no, member_name, status, version, remark, created_at, updated_at FROM md_order WHERE id = CAST(:id AS INTEGER)',
  'rawSql',
  '[{"name":"id","type":"integer"}]'::jsonb
),
(
  'q_md_order_lines',
  'entity_md_order_line',
  'SELECT id, order_id, service_name, staff_name, qty, unit_price, amount FROM md_order_line WHERE order_id = CAST(:id AS INTEGER) ORDER BY id',
  'rawSql',
  '[{"name":"id","type":"integer"}]'::jsonb
);

INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'md_order_guide',
  '主从单据 · 导览',
  '/demo/md-order-guide',
  'q_md_order_guide',
  'entity_md_order_guide',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "MasterDetail 导览",
    "description": "Slice 8：头行同屏、临时行状态、整单草稿/提交、单事务与乐观锁。",
    "badge": "MasterDetail"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": false },
  "table": {
    "columns": [
      { "field": "step_no", "label": "#", "width": 56 },
      { "field": "topic", "label": "主题", "width": 220 },
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
  'md_order_workbench',
  '主从单据 · 服务订单',
  '/demo/md-order',
  'q_md_order_list',
  'entity_md_order',
  $cfg$
{
  "version": 1,
  "presentation": {
    "title": "服务订单（主从）",
    "description": "选择会员，添加多个项目与员工，保存草稿后整单提交。头+行同一事务。",
    "badge": "MasterDetail"
  },
  "features": { "create": false, "edit": false, "delete": false, "pagination": true },
  "masterDetail": {
    "enabled": true,
    "title": "服务订单",
    "draftStatus": "draft",
    "submitStatus": "submitted",
    "header": {
      "entityCode": "entity_md_order",
      "primaryKey": "id",
      "versionField": "version",
      "statusField": "status",
      "requiredMemberField": "member_name",
      "loadQueryCode": "q_md_order_header",
      "fields": [
        { "field": "order_no", "label": "单号", "type": "string", "required": true },
        { "field": "member_name", "label": "会员", "type": "string", "required": true },
        { "field": "status", "label": "状态", "type": "string", "readOnly": true },
        { "field": "version", "label": "版本", "type": "integer", "readOnly": true },
        { "field": "remark", "label": "备注", "type": "string" }
      ]
    },
    "lines": {
      "entityCode": "entity_md_order_line",
      "primaryKey": "id",
      "fkField": "order_id",
      "loadQueryCode": "q_md_order_lines",
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
      { "field": "id", "label": "ID", "width": 64 },
      { "field": "order_no", "label": "单号", "width": 120 },
      { "field": "member_name", "label": "会员", "width": 120 },
      { "field": "status", "label": "状态", "width": 100, "format": "badge" },
      { "field": "version", "label": "版本", "width": 72 }
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

-- Seed one draft for open-demo
INSERT INTO md_order (order_no, member_name, status, remark, version)
VALUES ('SO-DEMO-1', '小美', 'draft', '演示草稿', 1);

INSERT INTO md_order_line (order_id, service_name, staff_name, qty, unit_price, amount)
SELECT id, '深层清洁', '林护士', 1, 298, 298 FROM md_order WHERE order_no = 'SO-DEMO-1';

COMMIT;
