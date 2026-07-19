-- 1. Create Business Demo Tables
DROP TABLE IF EXISTS lowcode_demo_supplier CASCADE;
CREATE TABLE lowcode_demo_supplier (
    supplier_code VARCHAR(50) PRIMARY KEY,
    supplier_name VARCHAR(100) NOT NULL
);

DROP TABLE IF EXISTS lowcode_demo_customer CASCADE;
CREATE TABLE lowcode_demo_customer (
    customer_code VARCHAR(50) PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL
);

DROP TABLE IF EXISTS lowcode_demo_order CASCADE;
CREATE TABLE lowcode_demo_order (
    id BIGSERIAL PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL UNIQUE,
    customer_code VARCHAR(50) REFERENCES lowcode_demo_customer(customer_code),
    supplier_code VARCHAR(50) REFERENCES lowcode_demo_supplier(supplier_code),
    amount DECIMAL(12, 2) NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 2. Seed Business Demo Data
INSERT INTO lowcode_demo_supplier (supplier_code, supplier_name) VALUES
('S_APPLE', 'Apple Supply Chain Inc.'),
('S_MICRO', 'Microsoft Hardware Partner'),
('S_DELL', 'Dell Direct Logistics'),
('S_LENOVO', 'Lenovo Global Mfg.');

INSERT INTO lowcode_demo_customer (customer_code, customer_name) VALUES
('C_ALICE', 'Alice Johnson'),
('C_BOB', 'Bob Smith'),
('C_CHARLIE', 'Charlie Brown'),
('C_DAVID', 'David Davis'),
('C_EVA', 'Eva Green');

INSERT INTO lowcode_demo_order (order_no, customer_code, supplier_code, amount, order_date) VALUES
('ORD-2026-001', 'C_ALICE', 'S_APPLE', 15999.00, '2026-07-01'),
('ORD-2026-002', 'C_BOB', 'S_DELL', 8450.50, '2026-07-01'),
('ORD-2026-003', 'C_CHARLIE', 'S_MICRO', 23000.00, '2026-07-02'),
('ORD-2026-004', 'C_DAVID', 'S_LENOVO', 4500.00, '2026-07-02'),
('ORD-2026-005', 'C_EVA', 'S_APPLE', 9800.00, '2026-07-02'),
('ORD-2026-006', 'C_ALICE', 'S_LENOVO', 12300.00, '2026-07-03');

-- 3. Clean and Setup Lowcode Metadata
DELETE FROM lc_page_model WHERE page_code = 'demo_order_page';
DELETE FROM lc_query_model WHERE query_code IN ('q_demo_order_list', 'q_demo_supplier_options', 'q_demo_customer_suggest');
DELETE FROM lc_entity_model WHERE entity_code = 'entity_demo_order';

-- 3.1 Entity Model
INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json)
VALUES (
    'entity_demo_order', 
    'lowcode_demo_order', 
    'id', 
    '[
        {"field": "id", "label": "ID", "type": "integer"},
        {"field": "order_no", "label": "Order No", "type": "string"},
        {"field": "customer_code", "label": "Customer", "type": "string"},
        {"field": "supplier_code", "label": "Supplier", "type": "string"},
        {"field": "amount", "label": "Amount", "type": "number"},
        {"field": "order_date", "label": "Order Date", "type": "datetime"}
    ]'::jsonb
);

-- 3.2 Query Models
INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode)
VALUES 
(
    'q_demo_order_list', 
    'entity_demo_order', 
    'SELECT id, order_no, customer_code, supplier_code, amount, order_date FROM lowcode_demo_order',
    'singleTableTemplate'
),
(
    'q_demo_supplier_options',
    NULL,
    'SELECT supplier_code, supplier_name FROM lowcode_demo_supplier',
    'rawSql'
),
(
    'q_demo_customer_suggest',
    NULL,
    'SELECT customer_code, customer_name FROM lowcode_demo_customer WHERE customer_name ILIKE :keyword',
    'rawSql'
);

-- 3.3 Page Model
INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
VALUES (
    'demo_order_page',
    'Order Workspace (Demo 1.1)',
    '/demo-order',
    'q_demo_order_list',
    'entity_demo_order',
    '{
      "presentation": {
        "title": "Order Workspace (Demo 1.1)",
        "description": "Demonstrating dynamic SQL dropdown and dynamic autocomplete suggest filters.",
        "badge": "Version 1.1 Showcase"
      },
      "dataSource": {
        "queryCode": "q_demo_order_list",
        "pageSize": 10
      },
      "table": {
        "columns": [
          { "field": "order_no", "label": "Order Number", "width": 180 },
          { "field": "customer_code", "label": "Customer Code", "tone": "accent" },
          { "field": "supplier_code", "label": "Supplier Code" },
          { "field": "amount", "label": "Total Amount", "format": "number" },
          { "field": "order_date", "label": "Order Date", "format": "datetime" }
        ],
        "filters": [
          {
            "field": "order_no",
            "label": "Order No",
            "type": "text",
            "placeholder": "Search by order no..."
          },
          {
            "field": "supplier_code",
            "label": "Supplier Dropdown (SQL)",
            "type": "select",
            "options": {
              "source": "sql",
              "queryCode": "q_demo_supplier_options",
              "labelField": "supplier_name",
              "valueField": "supplier_code"
            }
          },
          {
            "field": "customer_code",
            "label": "Customer Suggest (Autocomplete)",
            "type": "autocomplete",
            "placeholder": "Type customer name (e.g. Alice)...",
            "options": {
              "source": "sql",
              "queryCode": "q_demo_customer_suggest",
              "labelField": "customer_name",
              "valueField": "customer_code",
              "keywordParam": "keyword"
            }
          }
        ],
        "actions": [
          { "code": "refresh_grid", "label": "Refresh", "dsl": "grid.refresh", "scope": "page", "variant": "primary" },
          { "code": "duplicate_row", "label": "Duplicate", "dsl": "record.duplicate", "scope": "row", "variant": "secondary" }
        ]
      },
      "features": {
        "pagination": true,
        "create": true,
        "edit": false,
        "delete": true,
        "export": true,
        "density": "comfortable"
      }
    }'::jsonb
);
