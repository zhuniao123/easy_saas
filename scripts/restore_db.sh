#!/usr/bin/env bash
# Restore lowcode DB from a gzipped pg_dump produced by backup_db.sh
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi

ARCHIVE="$1"
CONTAINER="${PG_CONTAINER:-saas-demo-postgres}"
DB_USER="${PGUSER:-lowcode}"
DB_NAME="${PGDATABASE:-lowcode}"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "ERROR: file not found: $ARCHIVE" >&2
  exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "ERROR: container '$CONTAINER' is not running" >&2
  exit 1
fi

echo "[restore] WARNING: this will overwrite database '${DB_NAME}'"
echo "[restore] source: $ARCHIVE"
read -r -p "Type YES to continue: " confirm
[[ "$confirm" == "YES" ]] || { echo "aborted"; exit 1; }

gunzip -c "$ARCHIVE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1
echo "[restore] done"
