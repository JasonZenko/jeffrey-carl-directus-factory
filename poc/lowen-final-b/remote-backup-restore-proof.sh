#!/usr/bin/env bash
set -euo pipefail

CMS_ROOT="/opt/pearl-lowen-poc-cms"
RUN_ID="${1:-final-b-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_DIR="$CMS_ROOT/backups/$RUN_ID"
DUMP="$BACKUP_DIR/database.dump"
UPLOADS="$BACKUP_DIR/uploads.tar.gz"
RECEIPT="$BACKUP_DIR/backup-restore-receipt.json"
TEMP_DB="lowen_restore_${RUN_ID//[^a-zA-Z0-9]/_}"

cd "$CMS_ROOT"
set -a
. ./.env
set +a
umask 077
mkdir -p "$BACKUP_DIR"

cleanup() {
  docker compose exec -T database psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TEMP_DB\" WITH (FORCE);" </dev/null >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose exec -T database pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges </dev/null > "$DUMP"
tar -czf "$UPLOADS" uploads
docker compose exec -T database pg_restore --list < "$DUMP" >/dev/null
tar -tzf "$UPLOADS" >/dev/null

COUNT_SQL="SELECT json_build_object('pearl_pages',(SELECT count(*) FROM pearl_pages),'pearl_page_builder',(SELECT count(*) FROM pearl_page_builder),'pearl_sites',(SELECT count(*) FROM pearl_sites),'pearl_navigation_items',(SELECT count(*) FROM pearl_navigation_items),'directus_files',(SELECT count(*) FROM directus_files))::text;"
SOURCE_COUNTS="$(docker compose exec -T database psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "$COUNT_SQL" </dev/null)"

docker compose exec -T database psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TEMP_DB\";" </dev/null >/dev/null
docker compose exec -T database pg_restore -U "$POSTGRES_USER" -d "$TEMP_DB" --exit-on-error --no-owner --no-privileges < "$DUMP"
RESTORED_COUNTS="$(docker compose exec -T database psql -U "$POSTGRES_USER" -d "$TEMP_DB" -Atqc "$COUNT_SQL" </dev/null)"

if [[ "$SOURCE_COUNTS" != "$RESTORED_COUNTS" ]]; then
  echo "Restored critical-table counts do not match source" >&2
  exit 1
fi

DUMP_SHA="$(shasum -a 256 "$DUMP" | awk '{print $1}')"
UPLOADS_SHA="$(shasum -a 256 "$UPLOADS" | awk '{print $1}')"
export RUN_ID BACKUP_DIR DUMP_SHA UPLOADS_SHA SOURCE_COUNTS RESTORED_COUNTS RECEIPT
python3 - <<'PY'
import json
import os
from datetime import datetime, timezone

receipt = {
    "ok": True,
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "run_id": os.environ["RUN_ID"],
    "backup_dir": os.environ["BACKUP_DIR"],
    "database_dump_sha256": os.environ["DUMP_SHA"],
    "uploads_archive_sha256": os.environ["UPLOADS_SHA"],
    "pg_restore_list_verified": True,
    "uploads_archive_verified": True,
    "temporary_database_restore_verified": True,
    "source_counts": json.loads(os.environ["SOURCE_COUNTS"]),
    "restored_counts": json.loads(os.environ["RESTORED_COUNTS"]),
    "temporary_database_removed_on_exit": True,
}
with open(os.environ["RECEIPT"], "w", encoding="utf-8") as handle:
    json.dump(receipt, handle, indent=2)
    handle.write("\n")
print(json.dumps(receipt, indent=2))
PY
