-- Ensure clerk has a complete, demo-friendly grant set without config/system pages.
-- Owner is left untouched (refresh-catalog already grants owner everything).

-- Pages (business + guide only)
DELETE FROM lc_role_permission
WHERE role_code = 'clerk'
  AND perm_code IN (SELECT perm_code FROM lc_permission WHERE perm_type = 'page');

INSERT INTO lc_role_permission (role_code, perm_code)
SELECT 'clerk', perm_code FROM lc_permission
WHERE perm_type = 'page'
  AND perm_code IN (
    'page:showcase_guide',
    'page:shop_products', 'page:shop_sales', 'page:shop_purchases',
    'page:shop_stock_moves', 'page:shop_customers', 'page:shop_suppliers',
    'page:shop_low_stock', 'page:shop_today_sales', 'page:product_ledger'
  )
ON CONFLICT DO NOTHING;

-- Queries: all shop / guide / product_ledger queries
INSERT INTO lc_role_permission (role_code, perm_code)
SELECT 'clerk', perm_code FROM lc_permission
WHERE perm_type = 'query'
  AND (
    resource_code LIKE 'q_shop_%'
    OR resource_code LIKE 'sql_shop_%'
    OR resource_code LIKE 'q_product%'
    OR resource_code LIKE 'sql_%product%'
    OR resource_code LIKE 'q_stock%'
    OR resource_code = 'q_showcase_guide'
    OR resource_code LIKE 'q_shop%'
  )
ON CONFLICT DO NOTHING;

-- Also grant by prefix on perm_code
INSERT INTO lc_role_permission (role_code, perm_code)
SELECT 'clerk', perm_code FROM lc_permission
WHERE perm_type = 'query'
  AND (
    perm_code LIKE 'query:q_shop%'
    OR perm_code LIKE 'query:sql_shop%'
    OR perm_code LIKE 'query:q_product%'
    OR perm_code LIKE 'query:sql_%product%'
    OR perm_code LIKE 'query:q_stock%'
    OR perm_code = 'query:q_showcase_guide'
    OR perm_code LIKE 'query:q_sug%'
    OR perm_code LIKE 'query:q_product_category%'
  )
ON CONFLICT DO NOTHING;

-- Actions: shop + product enable/qty, but not disable
INSERT INTO lc_role_permission (role_code, perm_code)
SELECT 'clerk', perm_code FROM lc_permission
WHERE perm_type = 'action'
  AND perm_code NOT IN (
    'action:shop_disable_product',
    'action:disable_product'
  )
  AND (
    perm_code LIKE 'action:shop_%'
    OR perm_code IN ('action:enable_product', 'action:qty_plus_one')
  )
ON CONFLICT DO NOTHING;

-- No field cost, no perm:config, no sys pages (already excluded above)
DELETE FROM lc_role_permission
WHERE role_code = 'clerk'
  AND perm_code IN (
    'perm:config',
    'page:sys-sql-repo',
    'page:sys-page-manager',
    'page:sys-rbac',
    'field:entity_shop_product.cost_price',
    'field:entity_product.cost_price'
  );
