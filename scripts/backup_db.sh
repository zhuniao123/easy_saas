#!/usr/bin/env bash
# Backup the PostgreSQL service from docker-compose.preview.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${PG_CONTAINER:-}"
DB_USER="${PGUSER:-lowcode}"
DB_NAME="${PGDATABASE:-lowcode}"
OUT_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${OUT_DIR}/lowcode_${STAMP}.sql.gz"
KEEP="${BACKUP_KEEP:-14}"

mkdir -p "$OUT_DIR"

if [[ -n "$CONTAINER" ]]; then
  SOURCE="$CONTAINER"
  docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "ERROR: container '$CONTAINER' is not running" >&2; exit 1; }
  docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip -c > "$OUT_FILE"
else
  SOURCE="compose:postgres"
  docker compose -f "$ROOT/docker-compose.preview.yml" exec -T postgres \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip -c > "$OUT_FILE"
fi

echo "[backup] dumped ${DB_NAME} from ${SOURCE} -> ${OUT_FILE}"

# also write a small metadata sidecar
cat > "${OUT_FILE}.meta" <<EOF
timestamp=${STAMP}
source=${SOURCE}
database=${DB_NAME}
user=${DB_USER}
host=$(hostname)
bytes=$(wc -c < "$OUT_FILE" | tr -d ' ')
EOF

# rotate old backups
mapfile -t OLD < <(ls -1t "$OUT_DIR"/lowcode_*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" || true)
for f in "${OLD[@]:-}"; do
  [[ -n "$f" ]] || continue
  rm -f "$f" "${f}.meta"
  echo "[backup] removed old $f"
done

echo "[backup] ok: $OUT_FILE ($(du -h "$OUT_FILE" | awk '{print $1}'))"
echo "[backup] keep last ${KEEP} dumps in ${OUT_DIR}"
