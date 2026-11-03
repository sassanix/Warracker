#!/bin/bash
set -euo pipefail

echo "=== Warracker Startup ==="

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Database connection check (with retry). A plain TCP probe from Python
# replaces pg_isready, so the image no longer needs postgresql-client.
log "Waiting for database connection..."
for i in {1..30}; do
    if python -c "
import os, socket, sys
try:
    with socket.create_connection((os.environ.get('DB_HOST', 'localhost'), int(os.environ.get('DB_PORT', '5432'))), timeout=2):
        sys.exit(0)
except OSError:
    sys.exit(1)
" > /dev/null 2>&1; then
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

# Print a banner to the container log once the app answers its health
# check, so a healthy startup is easy to spot. Runs in the background:
# the supervisor start below is not delayed by it, and if the app never
# becomes healthy the banner simply never prints.
print_banner_when_ready() {
    local health_url="http://localhost/api/health"
    if [ "${DISABLE_NGINX:-false}" = "true" ]; then
        health_url="http://localhost:5000/api/health"
    fi
    for i in {1..45}; do
        if curl -fs "$health_url" > /dev/null 2>&1; then
            cat <<'BANNER'
█     █                               █
█  ▄  █  ▀▀▀▄ █▀▀▀▄ █▀▀▀▄  ▀▀▀▄ ▄▀▀▀▄ █  ▄▀ ▄▀▀▀▄ █▀▀▀▄
█ ▄▀▄ █ ▄▀▀▀█ █     █     ▄▀▀▀█ █     █▀▀▄  █▀▀▀▀ █
▀▄▀ ▀▄▀ ▀▄▄▄█ █     █     ▀▄▄▄█ ▀▄▄▄▀ █   █ ▀▄▄▄▀ █
BANNER
            log "Warracker is up and healthy."
            return 0
        fi
        sleep 2
    done
}
print_banner_when_ready &

# Execute the CMD (supervisor) by replacing this shell process
log "Starting supervisor..."
exec "$@"
