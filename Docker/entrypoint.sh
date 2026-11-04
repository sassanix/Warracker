#!/bin/bash
set -euo pipefail

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Version, read from the version checker shipped with the frontend so
# the log header always names the build that is actually starting.
APP_VERSION="unknown"
if [ -f /var/www/html/version-checker.js ]; then
    APP_VERSION=$(grep -o "currentVersion = '[^']*'" /var/www/html/version-checker.js | head -1 | cut -d"'" -f2 || true)
    if [ -z "$APP_VERSION" ]; then
        APP_VERSION="unknown"
    fi
fi

echo "=== Warracker ${APP_VERSION} ==="

# Configuration summary: the values support questions ask for first
# when a user pastes their startup log. Passwords are never printed.
DB_DISPLAY_HOST="${DB_HOST:-localhost}"
DB_DISPLAY_PORT="${DB_PORT:-5432}"
DB_DISPLAY_NAME="${DB_NAME:-warranty_db}"
DB_DISPLAY_USER="${DB_USER:-warranty_user}"
log "Database: ${DB_DISPLAY_HOST}:${DB_DISPLAY_PORT}, database ${DB_DISPLAY_NAME}, user ${DB_DISPLAY_USER}"
if [ "${DISABLE_NGINX:-false}" = "true" ]; then
    log "Web: nginx disabled, gunicorn serves directly on port 5000"
else
    log "Web: nginx on port 80, upload limit ${NGINX_MAX_BODY_SIZE_VALUE:-32M}"
fi
log "Memory mode: ${WARRACKER_MEMORY_MODE:-optimized}"
if [ -n "${FRONTEND_URL:-}" ]; then
    log "Frontend URL (used for login redirects): ${FRONTEND_URL}"
elif [ -n "${APP_BASE_URL:-}" ]; then
    log "Frontend URL (used for login redirects): ${APP_BASE_URL} (from APP_BASE_URL)"
else
    log "Frontend URL (used for login redirects): not set, the built-in default http://localhost:8080 will be used"
fi

# Database connection check (with retry). A plain TCP probe from Python
# replaces pg_isready, so the image no longer needs postgresql-client.
log "Waiting for database connection to ${DB_DISPLAY_HOST}:${DB_DISPLAY_PORT}..."
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
        log "ERROR: Could not reach the database at ${DB_DISPLAY_HOST}:${DB_DISPLAY_PORT} after 30 attempts (about 60 seconds)."
        log "ERROR: Check that the database container is running and that DB_HOST and DB_PORT point to it, then restart this container."
        exit 1
    fi
    if [ $((i % 5)) -eq 0 ]; then
        log "Still waiting for database (attempt $i of 30)..."
    fi
    sleep 2
done

# Migrations and permissions. Each critical step is guarded so a
# failure stops startup with one clear line naming the step, instead
# of the script simply ending after a traceback.
log "Running database migrations..."
if ! python /app/migrations/apply_migrations.py; then
    log "ERROR: Database migrations failed, startup stopped. The messages above show the cause."
    exit 1
fi

log "Fixing permissions (database and upload folder)..."
if ! python /app/fix_permissions.py; then
    log "ERROR: Fixing permissions failed, startup stopped. The messages above show the cause."
    exit 1
fi

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
