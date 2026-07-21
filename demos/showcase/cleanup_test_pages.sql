-- Remove integration-test / junk pages so the sidebar is presentation-clean.
-- Does not touch shop_* or product_ledger business demos.

DELETE FROM lc_page_model WHERE page_code IN (
  'test_page', 'cfg_page', 'val_page', 'act_embed_page',
  'supplier_page', 'raw_page'
);

-- Queries first (FK to entity), then entities
DELETE FROM lc_query_model WHERE query_code IN (
  'q_user', 'q_users_score', 'q_users_score_cfg', 'q_supplier', 'q_supplier_filter',
  'q_t_customer', 'q_t_get_ops', 'q_t_sug', 'q_raw', 'q_test_groovy',
  'q_repo_try', 'q_repo_dml', 'sql_val_ok', 'sql_act_bump', 'q_sug'
);

DELETE FROM lc_entity_model WHERE entity_code IN (
  'entity_t_users', 'entity_t_users2', 'entity_t_users3', 'entity_t_supplier',
  'entity_t_customer', 'entity_t_op', 'entity_t_sug', 'entity_raw_ro',
  'entity_test_groovy', 'supplier', 'entity_op', 'entity_sug'
);

DELETE FROM lc_action WHERE action_code IN (
  'act_val_ok', 'act_disable_item', 'act_assert_fail', 'act_from_asset'
);

DELETE FROM lc_script WHERE script_code IN ('test_groovy', 'test_act');
