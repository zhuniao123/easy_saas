-- Seed data for secondary MySQL business database (multi-datasource demo).
-- Applied automatically by docker entrypoint on first boot.

CREATE DATABASE IF NOT EXISTS biz_mysql
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE biz_mysql;

CREATE TABLE IF NOT EXISTS mx_product (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  sku           VARCHAR(40)  NOT NULL UNIQUE,
  product_name  VARCHAR(120) NOT NULL,
  category      VARCHAR(40)  NOT NULL DEFAULT 'general',
  price         DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_qty     INT NOT NULL DEFAULT 0,
  status        TINYINT NOT NULL DEFAULT 1,
  remark        VARCHAR(500) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO mx_product (sku, product_name, category, price, stock_qty, status, remark) VALUES
  ('MX-001', 'MySQL 演示洗发水', '护理', 68.00, 120, 1, 'secondary ds row'),
  ('MX-002', 'MySQL 演示发膜', '护理', 128.00, 45, 1, NULL),
  ('MX-003', 'MySQL 演示剪刀', '工具', 268.00, 18, 1, NULL),
  ('MX-004', 'MySQL 停用商品', '工具', 9.90, 0, 0, 'status=0')
ON DUPLICATE KEY UPDATE
  product_name = VALUES(product_name),
  price = VALUES(price),
  stock_qty = VALUES(stock_qty);

CREATE TABLE IF NOT EXISTS mx_kpi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  metric_code VARCHAR(40) NOT NULL UNIQUE,
  metric_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  label_zh VARCHAR(80) NOT NULL
) ENGINE=InnoDB;

INSERT INTO mx_kpi (metric_code, metric_value, label_zh) VALUES
  ('orders_today', 17, '今日单量'),
  ('gmv_today', 3260.50, '今日GMV'),
  ('stock_skus', 3, '在售SKU')
ON DUPLICATE KEY UPDATE metric_value = VALUES(metric_value);
