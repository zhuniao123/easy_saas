#!/bin/bash
# Load demo SQL into running postgres container (compose project name: deploy)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/deploy"

# Find postgres container
CID=$(docker compose -f docker-compose.demo.yml ps -q postgres)
if [[ -z "$CID" ]]; then
  echo "postgres container not running"
  exit 1
fi

run_sql() {
  local f="$1"
  echo "==> $f"
  docker exec -i "$CID" psql -U lowcode -d lowcode < "$f"
}

# Core demos for presentation
run_sql "$ROOT/demos/beauty_salon/install.sql" || true
run_sql "$ROOT/demos/beauty_salon/deep_ops.sql" || true
run_sql "$ROOT/demos/simple_tour/install.sql" || true
run_sql "$ROOT/demos/dashboard_lite/install.sql" || true
run_sql "$ROOT/demos/master_detail/install.sql" || true
run_sql "$ROOT/demos/slice_lab/install.sql" || true

# Optional larger demos (best-effort)
if [[ -f "$ROOT/demos/shop_saas/install.sql" ]]; then
  run_sql "$ROOT/demos/shop_saas/install.sql" || true
fi
if [[ -f "$ROOT/demos/product_ledger/install.sql" ]]; then
  run_sql "$ROOT/demos/product_ledger/install.sql" || true
fi

echo "Demo install finished."
docker exec -i "$CID" psql -U lowcode -d lowcode -c \
  "SELECT page_code, title FROM lc_page_model WHERE page_code LIKE 'beauty_%' OR page_code LIKE 'dash_%' OR page_code LIKE 'tour_%' OR page_code LIKE 'md_%' ORDER BY 1;"
