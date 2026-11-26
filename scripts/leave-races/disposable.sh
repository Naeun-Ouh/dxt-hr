#!/bin/sh
# A fresh local cluster only; never accepts DATABASE_URL or an existing data directory.
set -eu
export LC_ALL=C LANG=C
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS PGSSLMODE PGTARGETSESSIONATTRS
: "${DXT_PG_BIN:?Set DXT_PG_BIN to a PostgreSQL 15+ bin directory}"
mode=${1:-main}
report_dir=${2:?Supply a new report directory}
case "$mode" in main|benefits) ;; *) echo 'Mode must be main or benefits' >&2; exit 2;; esac
[ ! -e "$report_dir" ] || { echo 'Report directory already exists' >&2; exit 2; }
mkdir -p "$report_dir"
report_dir=$(cd "$report_dir" && pwd)
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo=$(CDPATH= cd -- "$script_dir/../.." && pwd)
export PATH="$DXT_PG_BIN:$PATH"
cluster=$(mktemp -d /private/tmp/dxt-leave-races.XXXXXX)
# Explicit distinct local test port; never connect to a preexisting service on collision.
port=55438
started=0
cleanup() { if [ "$started" = 1 ]; then pg_ctl -D "$cluster/data" -m fast -w stop >> "$report_dir/server.log" 2>&1; fi; }
trap cleanup EXIT HUP INT TERM
initdb -D "$cluster/data" -U postgres -A trust --locale=C -E UTF8 > "$report_dir/init.log" 2>&1
pg_ctl -D "$cluster/data" -l "$report_dir/server.log" -o "-h 127.0.0.1 -p $port -k $cluster" -w start
started=1
psql -X -w -h 127.0.0.1 -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE dxt_leave_race_disposable;" -c "COMMENT ON DATABASE dxt_leave_race_disposable IS 'DXT_DISPOSABLE_LEAVE_RACE_DATABASE';" > "$report_dir/bootstrap.log"
psql -X -w -h 127.0.0.1 -p "$port" -U postgres -d dxt_leave_race_disposable -v ON_ERROR_STOP=1 -f "$script_dir/bootstrap.sql" >> "$report_dir/bootstrap.log" 2>&1
if [ "$mode" = benefits ]; then
 sha=2bd5e0c9fc284a49f555055b8393d867d8084fb1
 git -C "$repo" show "$sha:supabase/migrations/20261126045159_leave_benefit_review_apply.sql" > "$cluster/benefit.sql"
 psql -X -w -h 127.0.0.1 -p "$port" -U postgres -d dxt_leave_race_disposable -v ON_ERROR_STOP=1 -f "$cluster/benefit.sql" >> "$report_dir/bootstrap.log" 2>&1
 python3 "$script_dir/run.py" --database dxt_leave_race_disposable --port "$port" --ack-disposable DXT_DISPOSABLE_LEAVE_RACE_DATABASE --benefits-sha "$sha" --benefits-migration "$cluster/benefit.sql" --report "$report_dir/result.json"
else
 python3 "$script_dir/run.py" --database dxt_leave_race_disposable --port "$port" --ack-disposable DXT_DISPOSABLE_LEAVE_RACE_DATABASE --report "$report_dir/result.json"
fi
printf 'Stopped disposable cluster retained for inspection: %s\n' "$cluster"
