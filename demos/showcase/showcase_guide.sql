-- Showcase home: presentation checklist as a first-class low-code page.
-- Route groups under /demo so sidebar shows folder "Demo".

BEGIN;

DELETE FROM lc_page_model WHERE page_code = 'showcase_guide';
DELETE FROM lc_query_model WHERE query_code = 'q_showcase_guide';
DELETE FROM lc_entity_model WHERE entity_code = 'entity_showcase_guide';

INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json)
VALUES (
  'entity_showcase_guide',
  'lc_page_model',
  'step_no',
  '[
    {"field":"step_no","label":"步骤","type":"integer","format":"number"},
    {"field":"area","label":"能力域","type":"string","format":"badge"},
    {"field":"title","label":"演示点","type":"string"},
    {"field":"how","label":"操作要点","type":"string"},
    {"field":"account","label":"建议账号","type":"string","format":"badge"}
  ]'::jsonb
);

INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, params_json)
VALUES (
  'q_showcase_guide',
  'entity_showcase_guide',
  $sql$
SELECT * FROM (VALUES
  (1,  '登录/RBAC', '双角色登录',
   'owner/owner123 老板全权；clerk/clerk123 店员无配置态、无成本价', '两者都试'),
  (2,  '页面清单', '打开本页与 Shop 分组',
   '侧栏 Demo / Shop；clerk 看不到 Factory、SQL Repo、权限管理', 'owner'),
  (3,  '只读视图', '低库存预警',
   '打开 shop_low_stock，矿泉水低于安全库存（演示 rawSql 只读页）', 'clerk'),
  (4,  '事务过账', '采购确认入库',
   '采购明细 PO-2026-003 草稿行 → 确认入库 → 库存↑ + 流水 IN', 'clerk'),
  (5,  '事务过账', '销售确认出库',
   '销售明细 SO-2026-003 草稿 → 确认出库；可故意超库存看 assert 失败', 'clerk'),
  (6,  'CRUD', '商品台账维护',
   '新建/编辑商品；试停用（clerk 默认无停用按钮，owner 有）', '对比'),
  (7,  '钻取', 'openQuery 抽屉',
   '商品行 → 流水/销售；客户行 → 销售记录；采购/销售 → 同单明细', 'clerk'),
  (8,  '字段权限', '成本价隐藏',
   'clerk 登录看商品台账无 cost_price；owner 可见', '对比'),
  (9,  'SQL 仓库', '配置态资产',
   'owner 打开 SQL Repo，查看 sql_shop_* / q_shop_*，可 try-run', 'owner'),
  (10, '权限台', '可配页面权限',
   'owner → 权限 → 给 clerk 取消某页 → clerk 重登侧栏变化', 'owner'),
  (11, '单页样板', 'product_ledger',
   'Inventory 分组：更早的单页商品台账样板，可并存', 'owner')
) AS t(step_no, area, title, how, account)
ORDER BY step_no
$sql$,
  'rawSql',
  '[]'::jsonb
);

INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
  'showcase_guide',
  '演示导览 · Showcase',
  '/demo/showcase-guide',
  'q_showcase_guide',
  'entity_showcase_guide',
  $cfg$
{
  "version": 1,
  "features": { "create": false, "edit": false, "delete": false, "density": "comfortable" },
  "table": {
    "columns": [
      { "field": "step_no", "label": "#", "width": 56, "align": "center", "format": "number" },
      { "field": "area", "label": "能力域", "width": 110, "format": "badge", "tone": "accent" },
      { "field": "title", "label": "演示点", "width": 160 },
      { "field": "how", "label": "操作要点", "width": 420 },
      { "field": "account", "label": "账号", "width": 90, "format": "badge" }
    ],
    "filters": [],
    "actions": []
  }
}
$cfg$::jsonb
);

COMMIT;
