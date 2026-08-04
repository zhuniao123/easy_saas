# 多数据源 Demo：平台 Postgres + 业务 MySQL

## 架构

```text
┌─────────────────────┐     ┌──────────────────────┐
│  Postgres (default) │     │  MySQL (biz_mysql)   │
│  lc_* 元数据/权限    │     │  mx_product / mx_kpi │
└──────────▲──────────┘     └──────────▲───────────┘
           │ page/query 元数据           │ query 执行
           │                            │
      JdbcDataSourceRegistry.resolve(ds_code)
```

解析顺序：`page.data_source_code` > `query.data_source_code` > `default`。

## 一键

```bash
# 1) 后端需已包含 mysql-connector-j 并重启
cd backend && mvn -DskipTests package
# restart easy_saas / java -jar ...

# 2)
bash demos/mysql_ds/setup.sh
```

## 手动

```bash
docker run -d --name easy-saas-mysql \
  -e MYSQL_ROOT_PASSWORD=mysqlroot \
  -e MYSQL_DATABASE=biz_mysql \
  -e MYSQL_USER=biz -e MYSQL_PASSWORD=bizpass \
  -p 127.0.0.1:3306:3306 \
  -v "$PWD/demos/mysql_ds/init-mysql.sql:/docker-entrypoint-initdb.d/01-init.sql:ro" \
  mysql:8.0

# 管理台或 API 登记 ds_code=biz_mysql
# driver: com.mysql.cj.jdbc.Driver
# url: jdbc:mysql://127.0.0.1:3306/biz_mysql?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC

docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/mysql_ds/register_platform.sql
```

## 验证

1. 登录 → 打开 **`mx_product_list`**（数据应来自 MySQL）  
2. 打开 **DataSource Console** → `biz_mysql` → 试连  
3. 对比：`beauty_*` 页仍走 Postgres  

```bash
# 直接查 MySQL
docker exec easy-saas-mysql mysql -ubiz -pbizpass -e 'SELECT * FROM biz_mysql.mx_product'

# 平台 API 执行绑定了 MySQL 的 query
curl -s -X POST http://127.0.0.1:8081/api/v1/queries/q_mx_products/execute \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"params":{},"filters":[]}'
```

## 注意

- 平台库与业务库分离；**不要把 lc_* 建到 MySQL**。  
- 业务 SQL 不写 `biz_mysql.` 前缀（连接已选库）。  
- 文本筛选若默认 `ILIKE`，在 MySQL 上可能失败——本 demo 列表可先少用文本 filter，或后续做 Dialect。  
- 主从/锁 DSL 的 PG 特性不自动适用 MySQL 业务库。
