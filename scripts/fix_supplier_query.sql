-- Fix supplier_page / q_supplier when biz_supplier uses id (not supplier_id).
-- Live schema: biz_supplier(id, supplier_code, supplier_name, status)
-- Legacy fixture/entity used supplier_id — alias keeps page/entity field names working.

UPDATE lc_query_model
SET sql_text = 'SELECT id AS supplier_id, supplier_code, supplier_name, status FROM biz_supplier ORDER BY id'
WHERE query_code = 'q_supplier';

UPDATE lc_entity_model
SET primary_key = 'supplier_id',
    fields_json = '[
      {"type": "integer", "field": "supplier_id", "label": "ID"},
      {"type": "string", "field": "supplier_code", "label": "Code"},
      {"type": "string", "field": "supplier_name", "label": "Name"},
      {"type": "string", "field": "status", "label": "Status"}
    ]'::jsonb
WHERE entity_code = 'supplier'
  AND table_name = 'biz_supplier';
