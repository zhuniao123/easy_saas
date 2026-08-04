#!/usr/bin/env bash
# Start local MySQL + register secondary datasource + demo pages on platform PG.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MYSQL_NAME="${MYSQL_NAME:-easy-saas-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-mysqlroot}"
MYSQL_USER="${MYSQL_USER:-biz}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-bizpass}"
MYSQL_DB="${MYSQL_DB:-biz_mysql}"
API="${API:-http://127.0.0.1:8081}"

echo "==> [1/4] MySQL container ($MYSQL_NAME)"
if docker ps -a --format '{{.Names}}' | grep -qx "$MYSQL_NAME"; then
  docker start "$MYSQL_NAME" >/dev/null || true
else
  docker run -d --name "$MYSQL_NAME" \
    -e MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" \
    -e MYSQL_DATABASE="$MYSQL_DB" \
    -e MYSQL_USER="$MYSQL_USER" \
    -e MYSQL_PASSWORD="$MYSQL_PASSWORD" \
    -p "127.0.0.1:${MYSQL_PORT}:3306" \
    -v "$ROOT/demos/mysql_ds/init-mysql.sql:/docker-entrypoint-initdb.d/01-init.sql:ro" \
    mysql:8.0 \
    --character-set-server=utf8mb4 \
    --collation-server=utf8mb4_unicode_ci
fi

echo "==> wait MySQL ready"
for i in $(seq 1 60); do
  if docker exec "$MYSQL_NAME" mysqladmin ping -h127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; then
    echo "  mysql up (try $i)"
    break
  fi
  sleep 2
  if [[ "$i" == "60" ]]; then
    echo "MySQL not ready"; docker logs --tail=30 "$MYSQL_NAME"; exit 1
  fi
done

# Re-apply seed (idempotent) for existing volumes
docker exec -i "$MYSQL_NAME" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < "$ROOT/demos/mysql_ds/init-mysql.sql" 2>/dev/null || true

echo "==> [2/4] Sanity query on MySQL"
docker exec "$MYSQL_NAME" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e \
  "SELECT COUNT(*) FROM biz_mysql.mx_product;" 2>/dev/null | tail -1

echo "==> [3/4] Register lc_data_source via API (encrypted password)"
# login
TOKEN=$(curl -sS -X POST "$API/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"owner123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')
if [[ -z "$TOKEN" || ${#TOKEN} -lt 8 ]]; then
  echo "ERROR: cannot login API at $API (is backend running on 8081?)"
  exit 1
fi

# upsert datasource
CODE=$(curl -sS -o /tmp/ds_create.json -w '%{http_code}' -X POST "$API/api/v1/admin/data-sources" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{
    \"dsCode\": \"biz_mysql\",
    \"name\": \"业务库 MySQL\",
    \"driverClass\": \"com.mysql.cj.jdbc.Driver\",
    \"jdbcUrl\": \"jdbc:mysql://127.0.0.1:${MYSQL_PORT}/${MYSQL_DB}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC&useUnicode=true&characterEncoding=UTF-8\",
    \"username\": \"${MYSQL_USER}\",
    \"password\": \"${MYSQL_PASSWORD}\",
    \"maxPoolSize\": 5,
    \"enabled\": true,
    \"remark\": \"local multi-ds demo\"
  }")
if [[ "$CODE" != "200" && "$CODE" != "201" ]]; then
  # try update if exists
  CODE=$(curl -sS -o /tmp/ds_create.json -w '%{http_code}' -X PUT "$API/api/v1/admin/data-sources/biz_mysql" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{
      \"name\": \"业务库 MySQL\",
      \"driverClass\": \"com.mysql.cj.jdbc.Driver\",
      \"jdbcUrl\": \"jdbc:mysql://127.0.0.1:${MYSQL_PORT}/${MYSQL_DB}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC&useUnicode=true&characterEncoding=UTF-8\",
      \"username\": \"${MYSQL_USER}\",
      \"password\": \"${MYSQL_PASSWORD}\",
      \"maxPoolSize\": 5,
      \"enabled\": true,
      \"remark\": \"local multi-ds demo\"
    }")
fi
echo "  datasource API http=$CODE body=$(head -c 200 /tmp/ds_create.json)"

# test connection
curl -sS -X POST "$API/api/v1/admin/data-sources/biz_mysql/test" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' | tee /tmp/ds_test.json
echo

echo "==> [4/4] Register platform pages/queries"
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < "$ROOT/demos/mysql_ds/register_platform.sql"

echo ""
echo "OK multi-ds demo ready."
echo "  MySQL:  127.0.0.1:${MYSQL_PORT}  db=${MYSQL_DB} user=${MYSQL_USER}/${MYSQL_PASSWORD}"
echo "  Pages:  mx_ds_guide , mx_product_list"
echo "  Login:  owner / owner123"
