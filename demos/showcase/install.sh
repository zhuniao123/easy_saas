#!/usr/bin/env bash
# One-shot showcase install: clean junk pages + shop_saas + product_ledger + guide + RBAC refresh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG="docker exec -i saas-demo-postgres psql -U lowcode -d lowcode"
API="${SHOWCASE_API:-http://127.0.0.1:8081}"

echo "==> [1/5] Cleanup test/junk pages"
$PG < "$ROOT/demos/showcase/cleanup_test_pages.sql"

echo "==> [2/5] Install shop_saas (full multi-page retail)"
$PG < "$ROOT/demos/shop_saas/install.sql"

echo "==> [3/5] Install product_ledger (single-page sample)"
$PG < "$ROOT/demos/product_ledger/install.sql"

echo "==> [4/5] Install showcase guide page"
$PG < "$ROOT/demos/showcase/showcase_guide.sql"

echo "==> [5/5] Refresh permission catalog (owner login)"
# Wait briefly if backend is cold
for i in $(seq 1 20); do
  if curl -sf "$API/api/v1/auth/status" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
TOKEN=$(curl -sf -X POST "$API/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"loginName":"owner","password":"owner123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))' 2>/dev/null || true)

if [[ -n "${TOKEN:-}" ]]; then
  curl -sf -X POST "$API/api/v1/admin/rbac/refresh-catalog" \
    -H "Authorization: Bearer $TOKEN" >/dev/null
  echo "    Catalog refreshed (owner has all)."
else
  echo "    WARN: backend not reachable at $API — catalog refresh skipped (owner seed still OK on next boot)."
fi

# Always seed clerk demo matrix in DB (pages + shop queries/actions; no config/sys/cost)
$PG < "$ROOT/demos/showcase/seed_clerk_demo_grants.sql"
echo "    Clerk demo grants applied."

echo
echo "Showcase ready."
echo "  Public:  https://lowcode.lazyoldlearner.win/"
echo "  Local:   http://127.0.0.1:5173/"
echo "  Owner:   owner / owner123"
echo "  Clerk:   clerk / clerk123"
echo "  Start:   open 「演示导览 · Showcase」 then follow README.md"
echo
$PG -c "SELECT page_code, title, route_path FROM lc_page_model ORDER BY route_path;"
