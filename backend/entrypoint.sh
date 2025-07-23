#!/bin/bash
set -e

init_embedded_postgres() {
  echo "[Entrypoint] Starting embedded Postgres..."
  export PGDATA="/app/postgres_data"
  export PGPORT=5432
  export DB_HOST=localhost
  export DB_PORT=5432

  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[Entrypoint] Initializing Postgres data directory at $PGDATA..."
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$PGDATA"
    su postgres -c "/usr/lib/postgresql/15/bin/initdb -D $PGDATA"
  fi

  echo "[Entrypoint] Launching Postgres server..."
  su postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D $PGDATA -l $PGDATA/postgres.log start"

  # Wait for Postgres to be ready
  for i in {1..20}; do
    if pg_isready -h localhost -p 5432; then
      echo "[Entrypoint] Postgres is ready!"
      break
    fi
    echo "[Entrypoint] Waiting for Postgres to be ready... ($i)"
    sleep 1
  done
}

create_db_if_needed() {
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'\" | grep -q 1 || psql -c 'CREATE DATABASE \"$DB_NAME\";'"
}

create_user_if_needed() {
  cat > /tmp/create_user.sql <<EOF
DO \$\$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', '$DB_USER', '$DB_PASSWORD');
  END IF;
END
\$\$;
EOF
  su postgres -c "psql -f /tmp/create_user.sql"
  rm /tmp/create_user.sql
}

set_db_ownership_and_privileges() {
  su postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE \"$DB_NAME\" TO \"$DB_USER\";\""
  su postgres -c "psql -d \"$DB_NAME\" -c 'ALTER DATABASE \"$DB_NAME\" OWNER TO \"$DB_USER\";'"
  su postgres -c "psql -d \"$DB_NAME\" -c 'ALTER SCHEMA public OWNER TO \"$DB_USER\";'"
  su postgres -c "psql -d \"$DB_NAME\" -c 'GRANT ALL ON SCHEMA public TO \"$DB_USER\";'"
}

# --- Main Script ---

if [ "$USE_INTERNAL_DB" = "true" ]; then
  init_embedded_postgres
  create_db_if_needed
  create_user_if_needed
  set_db_ownership_and_privileges
fi

python /app/migrations/apply_migrations.py

if [ "$USE_INTERNAL_DB" != "true" ]; then
  python /app/fix_permissions.py
else
  echo "[Entrypoint] Skipping fix_permissions.py for embedded Postgres."
fi

cd /app && python -c "import subprocess; subprocess.run([\"pybabel\", \"compile\", \"-d\", \"locales\"], check=False)"
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf 