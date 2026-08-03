-- Beauty salon DEEP ops slice (configuration-only; no Java domain).
-- Patterns: document status transition / ledger consume / day settlement.
-- Requires base install.sql first. Idempotent enough to re-run meta parts.

BEGIN;

-- ---------------------------------------------------------------------------
-- Schema extensions (generic document / ledger / settlement shapes)
-- ---------------------------------------------------------------------------
ALTER TABLE beauty_order ADD COLUMN IF NOT EXISTS biz_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE beauty_order ADD COLUMN IF NOT EXISTS settled_flag INTEGER NOT NULL DEFAULT 0;
ALTER TABLE beauty_order ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE beauty_order ADD COLUMN IF NOT EXISTS status_remark VARCHAR(500);

UPDATE beauty_order SET biz_date = COALESCE(biz_date, created_at::date) WHERE biz_date IS NULL;

ALTER TABLE beauty_card_product ADD COLUMN IF NOT EXISTS card_kind VARCHAR(20) NOT NULL DEFAULT 'stored';
-- stored | session
ALTER TABLE beauty_card_product ADD COLUMN IF NOT EXISTS session_times INTEGER NOT NULL DEFAULT 0;

ALTER TABLE beauty_member_card ADD COLUMN IF NOT EXISTS card_kind VARCHAR(20) NOT NULL DEFAULT 'stored';
ALTER TABLE beauty_member_card ADD COLUMN IF NOT EXISTS remaining_times INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS beauty_card_consume (
  id            SERIAL PRIMARY KEY,
  card_id       INTEGER NOT NULL REFERENCES beauty_member_card(id),
  member_id     INTEGER NOT NULL REFERENCES beauty_member(id),
  times         INTEGER NOT NULL DEFAULT 1,
  service_name  VARCHAR(120) NOT NULL DEFAULT '',
  biz_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  remark        VARCHAR(500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beauty_daily_close (
  id            SERIAL PRIMARY KEY,
  biz_date      DATE NOT NULL UNIQUE,
  status        VARCHAR(20) NOT NULL DEFAULT 'closed',
  order_count   INTEGER NOT NULL DEFAULT 0,
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  remark        VARCHAR(500),
  closed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed session card product + one open session card for demo
INSERT INTO beauty_card_product (product_code, product_name, price, gift_amount, valid_days, card_kind, session_times, status)
VALUES ('CARD_S10', '护理次卡 10 次', 980, 0, 365, 'session', 10, 1)
ON CONFLICT (product_code) DO UPDATE SET
  card_kind = EXCLUDED.card_kind,
  session_times = EXCLUDED.session_times,
  product_name = EXCLUDED.product_name,
  price = EXCLUDED.price;

-- Ensure demo order has explicit biz_date
UPDATE beauty_order SET biz_date = CURRENT_DATE WHERE order_no = 'BO-DEMO-1';

-- Open a session card for 小美 if missing
INSERT INTO beauty_member_card (card_no, member_id, product_id, balance, status, card_kind, remaining_times, expire_at)
SELECT 'S-DEMO-M001', m.id, p.id, 0, 'active', 'session', 10, CURRENT_DATE + 365
FROM beauty_member m
CROSS JOIN beauty_card_product p
WHERE m.member_code = 'M001' AND p.product_code = 'CARD_S10'
  AND NOT EXISTS (SELECT 1 FROM beauty_member_card c WHERE c.card_no = 'S-DEMO-M001');

-- Sample approved order for day-close demo
INSERT INTO beauty_order (order_no, member_id, member_name, status, remark, version, total_amount, biz_date, approved_at)
SELECT 'BO-APPROVED-1', id, member_name, 'approved', '已审示例', 1, 128, CURRENT_DATE, NOW()
FROM beauty_member WHERE member_code = 'M003'
AND NOT EXISTS (SELECT 1 FROM beauty_order WHERE order_no = 'BO-APPROVED-1');

INSERT INTO beauty_order_line (order_id, service_name, staff_name, qty, unit_price, amount)
SELECT o.id, '精剪造型', '林发型师', 1, 128, 128
FROM beauty_order o
WHERE o.order_no = 'BO-APPROVED-1'
  AND NOT EXISTS (SELECT 1 FROM beauty_order_line l WHERE l.order_id = o.id);

-- ---------------------------------------------------------------------------
-- Entities / queries for board / cards / day close
-- ---------------------------------------------------------------------------
DELETE FROM lc_page_model WHERE page_code IN (
  'beauty_order_board', 'beauty_session_cards', 'beauty_day_close', 'beauty_ops_guide'
);
DELETE FROM lc_query_model WHERE query_code IN (
  'q_beauty_order_board', 'q_beauty_session_cards', 'q_beauty_day_summary',
  'q_beauty_ops_guide', 'q_beauty_consume_log',
  'sql_beauty_ord_assert_draft', 'sql_beauty_ord_assert_submitted',
  'sql_beauty_ord_assert_approved', 'sql_beauty_ord_assert_not_settled',
  'sql_beauty_ord_submit', 'sql_beauty_ord_approve', 'sql_beauty_ord_void',
  'sql_beauty_ord_reopen', 'sql_beauty_ord_recalc_total',
  'sql_beauty_card_assert_session', 'sql_beauty_card_consume', 'sql_beauty_card_consume_log',
  'sql_beauty_day_assert_clean', 'sql_beauty_day_lock_orders', 'sql_beauty_day_insert_close'
);
DELETE FROM lc_action WHERE action_code IN (
  'act_beauty_order_submit', 'act_beauty_order_approve', 'act_beauty_order_void',
  'act_beauty_order_reopen', 'act_beauty_card_consume', 'act_beauty_day_close'
);
DELETE FROM lc_entity_model WHERE entity_code IN (
  'entity_beauty_order_board', 'entity_beauty_session_card', 'entity_beauty_day_close', 'entity_beauty_ops_guide'
);

INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES
(
  'entity_beauty_ops_guide', 'lc_page_model', 'step_no',
  '[{"field":"step_no","label":"#","type":"integer"},{"field":"topic","label":"主题","type":"string"},{"field":"hint","label":"说明","type":"string"}]'::jsonb
),
(
  'entity_beauty_order_board', 'beauty_order', 'id',
  $f$[{"field":"id","label":"ID","type":"integer"},{"field":"order_no","label":"单号","type":"string"},{"field":"member_name","label":"会员","type":"string"},{"field":"status","label":"状态","type":"string"},{"field":"total_amount","label":"金额","type":"number"},{"field":"biz_date","label":"营业日","type":"date"},{"field":"settled_flag","label":"已日结","type":"integer"},{"field":"version","label":"版本","type":"integer"}]$f$::jsonb
),
(
  'entity_beauty_session_card', 'beauty_member_card', 'id',
  $f$[{"field":"id","label":"ID","type":"integer"},{"field":"card_no","label":"卡号","type":"string"},{"field":"member_id","label":"会员ID","type":"integer"},{"field":"remaining_times","label":"余次","type":"integer"},{"field":"status","label":"状态","type":"string"},{"field":"card_kind","label":"类型","type":"string"}]$f$::jsonb
),
(
  'entity_beauty_day_close', 'beauty_daily_close', 'id',
  $f$[{"field":"id","label":"ID","type":"integer"},{"field":"biz_date","label":"营业日","type":"date"},{"field":"status","label":"状态","type":"string"},{"field":"order_count","label":"单数","type":"integer"},{"field":"total_amount","label":"合计","type":"number"}]$f$::jsonb
);

INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, params_json) VALUES
(
  'q_beauty_ops_guide', 'entity_beauty_ops_guide',
  $sql$
SELECT * FROM (VALUES
  (1, '通用原则', '无 BeautyXxxService：状态迁移/扣次/日结 = sqlTransaction + assert'),
  (2, 'beauty_order_board', '单据台：提交→审单→改单(恢复草稿)→作废；已日结不可动'),
  (3, 'beauty_order_md', '仅 draft 可改明细；其它状态只读'),
  (4, 'beauty_session_cards', '次卡账户：余次 + 核销流水（ledger）'),
  (5, 'beauty_day_close', '日结：锁定当日 approved 单，生成日结头')
) AS t(step_no, topic, hint) ORDER BY step_no
$sql$, 'rawSql', '[]'::jsonb
),
(
  'q_beauty_order_board', 'entity_beauty_order_board',
  $sql$
SELECT id, order_no, member_name, status, total_amount, biz_date, settled_flag, version, remark, created_at
FROM beauty_order
ORDER BY id DESC
$sql$, 'rawSql', '[]'::jsonb
),
(
  'q_beauty_session_cards', 'entity_beauty_session_card',
  $sql$
SELECT c.id, c.card_no, c.member_id, m.member_name, c.remaining_times, c.status, c.card_kind, c.expire_at
FROM beauty_member_card c
JOIN beauty_member m ON m.id = c.member_id
WHERE c.card_kind = 'session'
ORDER BY c.id DESC
$sql$, 'rawSql', '[]'::jsonb
),
(
  'q_beauty_consume_log', NULL,
  $sql$
SELECT id, card_id, member_id, times, service_name, biz_date, remark, created_at
FROM beauty_card_consume
ORDER BY id DESC
LIMIT 50
$sql$, 'rawSql', '[]'::jsonb
),
(
  'q_beauty_day_summary', 'entity_beauty_day_close',
  $sql$
SELECT id, biz_date, status, order_count, total_amount, remark, closed_at
FROM beauty_daily_close
ORDER BY biz_date DESC
$sql$, 'rawSql', '[]'::jsonb
),
-- Document transitions (generic pattern: assert from-status + update to-status)
(
  'sql_beauty_ord_assert_draft', NULL,
  'SELECT (status = ''draft'' AND settled_flag = 0) AS ok FROM beauty_order WHERE id = CAST(:id AS INTEGER)',
  'rawSql', '[]'::jsonb
),
(
  'sql_beauty_ord_assert_submitted', NULL,
  'SELECT (status = ''submitted'' AND settled_flag = 0) AS ok FROM beauty_order WHERE id = CAST(:id AS INTEGER)',
  'rawSql', '[]'::jsonb
),
(
  'sql_beauty_ord_assert_approved', NULL,
  'SELECT (status = ''approved'' AND settled_flag = 0) AS ok FROM beauty_order WHERE id = CAST(:id AS INTEGER)',
  'rawSql', '[]'::jsonb
),
(
  'sql_beauty_ord_assert_not_settled', NULL,
  'SELECT (settled_flag = 0) AS ok FROM beauty_order WHERE id = CAST(:id AS INTEGER)',
  'rawSql', '[]'::jsonb
),
(
  'sql_beauty_ord_recalc_total', NULL,
  $sql$
UPDATE beauty_order o SET total_amount = COALESCE((
  SELECT SUM(amount) FROM beauty_order_line l WHERE l.order_id = o.id
), 0), updated_at = NOW()
WHERE o.id = CAST(:id AS INTEGER)
$sql$, 'dml', '[]'::jsonb
),
(
  'sql_beauty_ord_submit', NULL,
  $sql$
UPDATE beauty_order SET status = 'submitted', updated_at = NOW()
WHERE id = CAST(:id AS INTEGER) AND status = 'draft' AND settled_flag = 0
$sql$, 'dml', '[]'::jsonb
),
(
  'sql_beauty_ord_approve', NULL,
  $sql$
UPDATE beauty_order SET status = 'approved', approved_at = NOW(), updated_at = NOW()
WHERE id = CAST(:id AS INTEGER) AND status = 'submitted' AND settled_flag = 0
$sql$, 'dml', '[]'::jsonb
),
(
  'sql_beauty_ord_void', NULL,
  $sql$
UPDATE beauty_order SET status = 'void', updated_at = NOW(), status_remark = 'voided'
WHERE id = CAST(:id AS INTEGER) AND status IN ('draft','submitted','approved') AND settled_flag = 0
$sql$, 'dml', '[]'::jsonb
),
(
  'sql_beauty_ord_reopen', NULL,
  $sql$
UPDATE beauty_order
SET status = 'draft', version = version + 1, updated_at = NOW(), status_remark = 'reopened for edit'
WHERE id = CAST(:id AS INTEGER) AND status IN ('submitted','approved') AND settled_flag = 0
$sql$, 'dml', '[]'::jsonb
),
-- Session card ledger consume
(
  'sql_beauty_card_assert_session', NULL,
  $sql$
SELECT (card_kind = 'session' AND status = 'active' AND remaining_times >= 1) AS ok
FROM beauty_member_card WHERE id = CAST(:id AS INTEGER)
$sql$, 'rawSql', '[]'::jsonb
),
(
  'sql_beauty_card_consume', NULL,
  $sql$
UPDATE beauty_member_card
SET remaining_times = remaining_times - 1
WHERE id = CAST(:id AS INTEGER) AND card_kind = 'session' AND remaining_times >= 1
$sql$, 'dml', '[]'::jsonb
),
(
  'sql_beauty_card_consume_log', NULL,
  $sql$
INSERT INTO beauty_card_consume (card_id, member_id, times, service_name, biz_date, remark)
SELECT id, member_id, 1, '到店核销', CURRENT_DATE, 'session consume'
FROM beauty_member_card WHERE id = CAST(:id AS INTEGER)
$sql$, 'dml', '[]'::jsonb
),
-- Day close: no open drafts/submitted for biz_date; lock approved
(
  'sql_beauty_day_assert_clean', NULL,
  $sql$
SELECT (
  NOT EXISTS (
    SELECT 1 FROM beauty_order
    WHERE biz_date = CURRENT_DATE AND status IN ('draft','submitted') AND settled_flag = 0
  )
  AND NOT EXISTS (SELECT 1 FROM beauty_daily_close WHERE biz_date = CURRENT_DATE)
) AS ok
$sql$, 'rawSql', '[]'::jsonb
),
(
  'sql_beauty_day_lock_orders', NULL,
  $sql$
UPDATE beauty_order SET settled_flag = 1, updated_at = NOW()
WHERE biz_date = CURRENT_DATE AND status = 'approved' AND settled_flag = 0
$sql$, 'dml', '[]'::jsonb
),
(
  'sql_beauty_day_insert_close', NULL,
  $sql$
INSERT INTO beauty_daily_close (biz_date, status, order_count, total_amount, remark)
SELECT CURRENT_DATE, 'closed',
  COUNT(*), COALESCE(SUM(total_amount),0), 'day close'
FROM beauty_order
WHERE biz_date = CURRENT_DATE AND status = 'approved' AND settled_flag = 1
$sql$, 'dml', '[]'::jsonb
);

-- ---------------------------------------------------------------------------
-- Actions (generic document/ledger/settlement patterns)
-- ---------------------------------------------------------------------------
INSERT INTO lc_action (action_code, action_type, label, config_json, enabled) VALUES
(
  'act_beauty_order_submit', 'sqlTransaction', '提交待审',
  $cfg${
    "type":"sqlTransaction","refresh":true,"successMessage":"已提交待审",
    "bind":{"id":{"from":"row","field":"id","required":true}},
    "statements":[
      {"kind":"assert","sqlAssetCode":"sql_beauty_ord_assert_draft"},
      {"kind":"write","sqlAssetCode":"sql_beauty_ord_recalc_total"},
      {"kind":"write","sqlAssetCode":"sql_beauty_ord_submit"}
    ]
  }$cfg$::jsonb, true
),
(
  'act_beauty_order_approve', 'sqlTransaction', '审单通过',
  $cfg${
    "type":"sqlTransaction","refresh":true,"successMessage":"审单通过",
    "bind":{"id":{"from":"row","field":"id","required":true}},
    "statements":[
      {"kind":"assert","sqlAssetCode":"sql_beauty_ord_assert_submitted"},
      {"kind":"write","sqlAssetCode":"sql_beauty_ord_approve"}
    ]
  }$cfg$::jsonb, true
),
(
  'act_beauty_order_reopen', 'sqlTransaction', '改单(恢复草稿)',
  $cfg${
    "type":"sqlTransaction","refresh":true,"successMessage":"已恢复草稿，可改明细",
    "bind":{"id":{"from":"row","field":"id","required":true}},
    "statements":[
      {"kind":"assert","sqlAssetCode":"sql_beauty_ord_assert_not_settled"},
      {"kind":"write","sqlAssetCode":"sql_beauty_ord_reopen"}
    ]
  }$cfg$::jsonb, true
),
(
  'act_beauty_order_void', 'sqlTransaction', '作废',
  $cfg${
    "type":"sqlTransaction","refresh":true,"successMessage":"单据已作废",
    "bind":{"id":{"from":"row","field":"id","required":true}},
    "statements":[
      {"kind":"assert","sqlAssetCode":"sql_beauty_ord_assert_not_settled"},
      {"kind":"write","sqlAssetCode":"sql_beauty_ord_void"}
    ]
  }$cfg$::jsonb, true
),
(
  'act_beauty_card_consume', 'sqlTransaction', '核销1次',
  $cfg${
    "type":"sqlTransaction","refresh":true,"successMessage":"次卡已核销 1 次",
    "bind":{"id":{"from":"row","field":"id","required":true}},
    "statements":[
      {"kind":"assert","sqlAssetCode":"sql_beauty_card_assert_session"},
      {"kind":"write","sqlAssetCode":"sql_beauty_card_consume"},
      {"kind":"write","sqlAssetCode":"sql_beauty_card_consume_log"}
    ]
  }$cfg$::jsonb, true
),
(
  'act_beauty_day_close', 'sqlTransaction', '今日日结',
  $cfg${
    "type":"sqlTransaction","refresh":true,"successMessage":"日结完成：已审单据已锁定",
    "bind":{},
    "statements":[
      {"kind":"assert","sqlAssetCode":"sql_beauty_day_assert_clean"},
      {"kind":"write","sqlAssetCode":"sql_beauty_day_lock_orders"},
      {"kind":"write","sqlAssetCode":"sql_beauty_day_insert_close"}
    ]
  }$cfg$::jsonb, true
);

-- ---------------------------------------------------------------------------
-- Pages
-- ---------------------------------------------------------------------------
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES
(
  'beauty_ops_guide', '美发店 · 纵深店务导览', '/demo/beauty-ops-guide', 'q_beauty_ops_guide', 'entity_beauty_ops_guide',
  $cfg${
  "version":1,
  "presentation":{
    "title":"纵深店务（配置驱动）",
    "description":"审单/改单/次卡/日结 = 通用单据状态机 + 账户流水 + 日结锁定。无行业 Domain Java。",
    "badge":"Deep Ops"
  },
  "features":{"create":false,"edit":false,"delete":false,"pagination":false},
  "table":{
    "columns":[
      {"field":"step_no","label":"#","width":56},
      {"field":"topic","label":"主题","width":180},
      {"field":"hint","label":"说明","width":520}
    ],
    "filters":[],"actions":[]
  }
}$cfg$::jsonb
),
(
  'beauty_order_board', '美发店 · 单据台(审改)', '/demo/beauty-order-board', 'q_beauty_order_board', 'entity_beauty_order_board',
  $cfg${
  "version":1,
  "presentation":{
    "title":"服务单单据台",
    "description":"状态：draft→submitted→approved；改单=恢复草稿；作废；已日结不可操作。行按钮均为通用 sqlTransaction。",
    "badge":"Document Board"
  },
  "features":{"create":false,"edit":false,"delete":false,"pagination":true},
  "table":{
    "columns":[
      {"field":"order_no","label":"单号","width":120},
      {"field":"member_name","label":"会员","width":90},
      {"field":"status","label":"状态","width":100,"format":"badge"},
      {"field":"total_amount","label":"金额","width":90,"format":"money"},
      {"field":"biz_date","label":"营业日","width":110},
      {"field":"settled_flag","label":"日结","width":70},
      {"field":"version","label":"版本","width":64}
    ],
    "filters":[
      {"field":"status","label":"状态","type":"text","placeholder":"draft/submitted/approved/void"},
      {"field":"member_name","label":"会员","type":"text"}
    ],
    "actions":[
      {"code":"open_edit","label":"打开明细","type":"openPage","scope":"row","variant":"secondary",
        "openPage":{"pageCode":"beauty_order_md","title":"服务开单"}},
      {"code":"submit","label":"提交待审","type":"sqlTransaction","actionCode":"act_beauty_order_submit","scope":"row","variant":"primary",
        "when":{"field":"status","equals":"draft"}},
      {"code":"approve","label":"审单","type":"sqlTransaction","actionCode":"act_beauty_order_approve","scope":"row","variant":"success",
        "when":{"field":"status","equals":"submitted"}},
      {"code":"reopen","label":"改单","type":"sqlTransaction","actionCode":"act_beauty_order_reopen","scope":"row","variant":"secondary",
        "when":{"field":"status","equals":"approved"}},
      {"code":"void","label":"作废","type":"sqlTransaction","actionCode":"act_beauty_order_void","scope":"row","variant":"danger"}
    ]
  }
}$cfg$::jsonb
),
(
  'beauty_session_cards', '美发店 · 次卡账户', '/demo/beauty-session-cards', 'q_beauty_session_cards', 'entity_beauty_session_card',
  $cfg${
  "version":1,
  "presentation":{
    "title":"次卡（账户/流水）",
    "description":"不是流程节点：核销=余次-1 + 写 beauty_card_consume。可抄到健身课次/洗车次卡。",
    "badge":"Ledger"
  },
  "features":{"create":false,"edit":false,"delete":false,"pagination":true},
  "table":{
    "columns":[
      {"field":"card_no","label":"卡号","width":120},
      {"field":"member_name","label":"会员","width":90},
      {"field":"remaining_times","label":"余次","width":80,"format":"number"},
      {"field":"status","label":"状态","width":80,"format":"badge"},
      {"field":"expire_at","label":"到期","width":110}
    ],
    "filters":[{"field":"member_name","label":"会员","type":"text"}],
    "actions":[
      {"code":"consume","label":"核销1次","type":"sqlTransaction","actionCode":"act_beauty_card_consume","scope":"row","variant":"primary"}
    ]
  }
}$cfg$::jsonb
),
(
  'beauty_day_close', '美发店 · 日结', '/demo/beauty-day-close', 'q_beauty_day_summary', 'entity_beauty_day_close',
  $cfg${
  "version":1,
  "presentation":{
    "title":"营业日结",
    "description":"前置：当日不能有 draft/submitted。将 approved 单 settled_flag=1 并生成日结头。再改单会被 assert 挡住。",
    "badge":"Settlement"
  },
  "features":{"create":false,"edit":false,"delete":false,"pagination":true},
  "table":{
    "columns":[
      {"field":"biz_date","label":"营业日","width":120},
      {"field":"status","label":"状态","width":90,"format":"badge"},
      {"field":"order_count","label":"单数","width":80},
      {"field":"total_amount","label":"合计","width":100,"format":"money"},
      {"field":"closed_at","label":"日结时间","width":160,"format":"datetime"}
    ],
    "filters":[],
    "actions":[
      {"code":"close_today","label":"今日日结","type":"sqlTransaction","actionCode":"act_beauty_day_close","scope":"page","variant":"primary"},
      {"code":"to_board","label":"单据台","type":"openPage","scope":"page","variant":"secondary",
        "openPage":{"pageCode":"beauty_order_board","title":"单据台"}}
    ]
  }
}$cfg$::jsonb
);

-- Permissions
INSERT INTO lc_permission (perm_code, perm_type, resource_code, description)
SELECT v.p, v.t, v.r, v.d FROM (VALUES
  ('page:beauty_ops_guide','page','beauty_ops_guide','ops guide'),
  ('page:beauty_order_board','page','beauty_order_board','order board'),
  ('page:beauty_session_cards','page','beauty_session_cards','session cards'),
  ('page:beauty_day_close','page','beauty_day_close','day close'),
  ('query:q_beauty_ops_guide','query','q_beauty_ops_guide','q'),
  ('query:q_beauty_order_board','query','q_beauty_order_board','q'),
  ('query:q_beauty_session_cards','query','q_beauty_session_cards','q'),
  ('query:q_beauty_day_summary','query','q_beauty_day_summary','q'),
  ('query:q_beauty_consume_log','query','q_beauty_consume_log','q'),
  ('action:act_beauty_order_submit','action','act_beauty_order_submit','a'),
  ('action:act_beauty_order_approve','action','act_beauty_order_approve','a'),
  ('action:act_beauty_order_reopen','action','act_beauty_order_reopen','a'),
  ('action:act_beauty_order_void','action','act_beauty_order_void','a'),
  ('action:act_beauty_card_consume','action','act_beauty_card_consume','a'),
  ('action:act_beauty_day_close','action','act_beauty_day_close','a')
) AS v(p,t,r,d)
ON CONFLICT (perm_code) DO NOTHING;

INSERT INTO lc_role_permission (role_code, perm_code)
SELECT 'owner', perm_code FROM lc_permission
WHERE perm_code LIKE 'page:beauty_%' OR perm_code LIKE 'query:q_beauty_%' OR perm_code LIKE 'action:act_beauty_%'
ON CONFLICT DO NOTHING;

-- Patch open-card for session products: set remaining_times when session
-- (stored-value path unchanged; optional enhancement via separate action later)

COMMIT;
