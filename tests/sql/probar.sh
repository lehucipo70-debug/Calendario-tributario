#!/usr/bin/env bash
# Prueba los scripts de supabase/ en un PostgreSQL 16 local y temporal.
# Corre cada script DOS veces para comprobar que son idempotentes.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
DIR="$(mktemp -d)"; PUERTO=54329
chmod 755 "$DIR"
COMO=""; [ "$(id -u)" = 0 ] && { chown postgres "$DIR"; COMO="runuser -u postgres --"; }
limpiar() { $COMO "$BIN/pg_ctl" -D "$DIR/datos" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap limpiar EXIT
$COMO "$BIN/initdb" -D "$DIR/datos" -U postgres -A trust >/dev/null
$COMO "$BIN/pg_ctl" -D "$DIR/datos" -o "-p $PUERTO -k $DIR -c wal_level=logical" -l "$DIR/log" start -w >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$BIN/psql" -h "$DIR" -p $PUERTO -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$RAIZ/tests/sql/supabase-simulado.sql"
for i in 1 2; do
  "${PSQL[@]}" -f "$RAIZ/supabase/schema.sql"
  "${PSQL[@]}" -f "$RAIZ/supabase/permisos-ejemplo.sql"
  "${PSQL[@]}" -f "$RAIZ/supabase/migrar-obligaciones.sql"
done
for f in verificar ataques; do
  PGOPTIONS= "${PSQL[@]}" -f "$RAIZ/tests/sql/$f.sql" 2>&1 | sed 's/^psql:.*NOTICE:  /  /'
done
echo "SQL: todas las verificaciones pasaron"
