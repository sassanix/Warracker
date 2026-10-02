#!/bin/bash
set -euo pipefail

echo "=== Warracker Startup ==="

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Database connection check (with retry)
log "Waiting for database connection..."
for i in {1..30}; do
    if pg_isready -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" > /dev/null 2>&1; then
        log "Database is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        log "ERROR: Database not available after 30 attempts"
        exit 1
    fi
    sleep 2
done

# Migrations and permissions
log "Running database migrations..."
python /app/migrations/apply_migrations.py

log "Fixing permissions (database and upload folder)..."
python /app/fix_permissions.py

# Translation compilation
log "Compiling translations..."
cd /app
pybabel compile -d locales 2>/dev/null || log "Warning: Translation compilation failed"

# Nginx configuration (create temp file, root will move it)
log "Preparing nginx configuration..."
EFFECTIVE_SIZE="${NGINX_MAX_BODY_SIZE_VALUE:-32M}"
if ! echo "${EFFECTIVE_SIZE}" | grep -Eq "^[0-9]+[mMkKgG]?$"; then
    log "Warning: Invalid NGINX_MAX_BODY_SIZE_VALUE. Using default 32M"
    EFFECTIVE_SIZE="32M"
fi
sed "s|__NGINX_MAX_BODY_SIZE_CONFIG_VALUE__|${EFFECTIVE_SIZE}|g" \
    /etc/nginx/conf.d/default.conf.template > /tmp/nginx-default.conf

log "Nginx config prepared (size: ${EFFECTIVE_SIZE})"

# Optional: run gunicorn directly without nginx (issue #190).
# Set DISABLE_NGINX=true and publish port 5000 to put your own reverse
# proxy in front of the Flask app.
if [ "${DISABLE_NGINX:-false}" = "true" ]; then
    log "DISABLE_NGINX=true: removing nginx from supervisord; gunicorn serves directly on :5000"
    sed -i '/^\[program:nginx\]/,/^$/d' /etc/supervisor/conf.d/supervisord.conf
fi

log "Setup completed successfully!"

# Execute the CMD (supervisor) by replacing this shell process
log "Starting supervisor..."
exec "$@"
