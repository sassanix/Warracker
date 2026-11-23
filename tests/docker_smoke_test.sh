#!/usr/bin/env bash
# End-to-end Docker smoke tests for the built Warracker image.
# Runs in CI (.github/workflows/docker-build.yml) right after building
# warracker:ci, and can also be run locally against any image tag:
#   bash tests/docker_smoke_test.sh warracker:ci
set -euo pipefail

IMAGE="${1:-warracker:ci}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NET="warracker-ci-net-$$"
VOL="warracker-ci-uploads-$$"
PG_CTR="warracker-ci-pg-$$"
APP_CTR=""

DB_USER="warranty_user"
DB_PASS="ci_db_password_9876"
DB_NAME="warranty_db"

EXPECTED_VERSION="$(
    grep -o "currentVersion = '[^']*'" "${REPO_ROOT}/frontend/version-checker.js" \
        | head -1 | cut -d"'" -f2
)"

log() {
    echo "[docker-smoke] $*"
}

fail() {
    echo "[docker-smoke] FAIL: $*" >&2
    if [ -n "${APP_CTR}" ]; then
        echo "--- Container logs (${APP_CTR}) ---" >&2
        docker logs "${APP_CTR}" >&2 || true
    fi
    exit 1
}

cleanup() {
    local rc=$?
    for ctr in "${APP_CTR}" "${PG_CTR}"; do
        if [ -n "${ctr}" ]; then
            docker rm -f "${ctr}" >/dev/null 2>&1 || true
        fi
    done
    docker network rm "${NET}" >/dev/null 2>&1 || true
    docker volume rm "${VOL}" >/dev/null 2>&1 || true
    exit "${rc}"
}
trap cleanup EXIT

wait_for_health() {
    local ctr="$1"
    local url="$2"
    local max_attempts="${3:-45}"
    local last_out=""

    for i in $(seq 1 "${max_attempts}"); do
        local running
        running="$(docker inspect -f '{{.State.Running}}' "${ctr}" 2>/dev/null || echo false)"
        if [ "${running}" != "true" ]; then
            fail "Container ${ctr} exited before becoming healthy"
        fi
        local body=""
        if body="$(curl -fsS --max-time 5 "${url}" 2>&1)"; then
            if grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<< "${body}"; then
                return 0
            fi
            last_out="HTTP 200 unexpected body: ${body}"
        else
            last_out="${body}"
        fi
        sleep 1
    done
    fail "Timed out waiting for ${url} on container ${ctr} (last response: ${last_out})"
}

stop_app() {
    if [ -n "${APP_CTR}" ]; then
        docker rm -f "${APP_CTR}" >/dev/null 2>&1 || true
        APP_CTR=""
    fi
}

# ---------------------------------------------------------------------------
# 1. Validate shipped Docker Compose files
# ---------------------------------------------------------------------------
log "1/6 Validating Docker Compose files..."
docker compose -f "${REPO_ROOT}/docker-compose.yml" config -q
docker compose -f "${REPO_ROOT}/Docker/docker-compose.yml" config -q

# ---------------------------------------------------------------------------
# 2. Start PostgreSQL on an isolated Docker network
# ---------------------------------------------------------------------------
log "2/6 Starting PostgreSQL 15 container..."
docker network create "${NET}" >/dev/null
docker volume create "${VOL}" >/dev/null

docker run -d --name "${PG_CTR}" --network "${NET}" \
    -e "POSTGRES_DB=${DB_NAME}" \
    -e "POSTGRES_USER=${DB_USER}" \
    -e "POSTGRES_PASSWORD=${DB_PASS}" \
    postgres:15-alpine >/dev/null

for i in $(seq 1 30); do
    if docker exec "${PG_CTR}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
        break
    fi
    if [ "${i}" -eq 30 ]; then
        fail "PostgreSQL did not become ready"
    fi
    sleep 1
done

# ---------------------------------------------------------------------------
# 3. Default 4-variable stack (no DB_ADMIN_*, no SECRET_KEY, gevent workers)
#    + nginx security headers + API CRUD + persisted SECRET_KEY across recreate
# ---------------------------------------------------------------------------
log "3/6 Booting default 4-var stack (no DB_ADMIN_*, no SECRET_KEY, gevent workers)..."
APP_CTR="warracker-ci-default-$$"
docker run -d --name "${APP_CTR}" --network "${NET}" \
    -p 127.0.0.1:18005:80 \
    -v "${VOL}:/data/uploads" \
    -e "DB_HOST=${PG_CTR}" \
    -e "DB_NAME=${DB_NAME}" \
    -e "DB_USER=${DB_USER}" \
    -e "DB_PASSWORD=${DB_PASS}" \
    "${IMAGE}" >/dev/null

wait_for_health "${APP_CTR}" "http://127.0.0.1:18005/api/health"

# Confirm banner & version header appear in container logs (allow banner loop to flush).
banner_ok=false
app_logs=""
for i in $(seq 1 10); do
    app_logs="$(docker logs "${APP_CTR}" 2>&1 || true)"
    if grep -q "Warracker is up and healthy." <<< "${app_logs}"; then
        banner_ok=true
        break
    fi
    sleep 1
done
[ "${banner_ok}" = "true" ] || fail "Startup health banner not found in logs"
grep -q "=== Warracker ${EXPECTED_VERSION} ===" <<< "${app_logs}" \
    || fail "Startup log missing expected version header === Warracker ${EXPECTED_VERSION} ==="
if grep -q "Control server error" <<< "${app_logs}"; then
    fail "Gunicorn logged a control server permission error"
fi
sup_count="$(grep -c "supervisord started with pid 1" <<< "${app_logs}" || true)"
[ "${sup_count}" -eq 1 ] || fail "Expected 1 supervisord start line, saw ${sup_count}"
if grep -q 'Connection refused.*host: "localhost"' <<< "${app_logs}"; then
    fail "Startup banner probe triggered transient nginx Connection refused error"
fi

# Persisted generated SECRET_KEY must live in /data/uploads/.secret_key with 0600 & 999:999.
key_meta="$(docker exec "${APP_CTR}" stat -c '%u:%g:%a:%s' /data/uploads/.secret_key)"
log "   .secret_key metadata (uid:gid:mode:bytes) = ${key_meta}"
case "${key_meta}" in
    999:999:600:*) ;;
    *) fail "Unexpected .secret_key ownership/permissions: ${key_meta}" ;;
esac
key_size="${key_meta##*:}"
[ "${key_size}" -ge 32 ] || fail "Generated .secret_key is too short (${key_size} bytes)"

# Check frontend HTML + Nginx security headers + Server version suppression.
about_headers="$(mktemp)"
about_body="$(mktemp)"
http_code="$(curl -sS -D "${about_headers}" -o "${about_body}" -w '%{http_code}' http://127.0.0.1:18005/about.html)"
[ "${http_code}" = "200" ] || fail "GET /about.html returned ${http_code}"
grep -q "Version v${EXPECTED_VERSION}" "${about_body}" \
    || fail "/about.html does not contain Version v${EXPECTED_VERSION}"
grep -iq "^x-frame-options:.*SAMEORIGIN" "${about_headers}" \
    || fail "Missing X-Frame-Options: SAMEORIGIN on /about.html"
grep -iq "^referrer-policy:.*strict-origin-when-cross-origin" "${about_headers}" \
    || fail "Missing Referrer-Policy on /about.html"
grep -iq "^content-security-policy:" "${about_headers}" \
    || fail "Missing Content-Security-Policy on /about.html"
if grep -iq "upgrade-insecure-requests" "${about_headers}"; then
    fail "CSP must not include upgrade-insecure-requests (breaks plain-HTTP self-hosted installs)"
fi
if grep -iqE "^server:.*nginx/[0-9]" "${about_headers}"; then
    fail "Nginx Server header discloses version number"
fi
rm -f "${about_headers}" "${about_body}"

# End-to-end API flow through Nginx -> Gunicorn (gevent) -> PostgreSQL.
reg_resp="$(curl -fsS -X POST http://127.0.0.1:18005/api/auth/register \
    -H 'Content-Type: application/json' \
    -d '{"username":"smokeadmin","email":"smokeadmin@test.local","password":"SmokePassword123!"}')"
token="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["token"])' <<< "${reg_resp}")"
[ -n "${token}" ] || fail "Register response did not include JWT token"

create_resp="$(curl -fsS -X POST http://127.0.0.1:18005/api/warranties \
    -H "Authorization: Bearer ${token}" \
    -F "product_name=Docker Smoke Router" \
    -F "purchase_date=2025-01-15" \
    -F "exact_expiration_date=2027-01-15")"
wid="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["id"])' <<< "${create_resp}")"
[ -n "${wid}" ] || fail "Create warranty response did not include id"

list_resp="$(curl -fsS http://127.0.0.1:18005/api/warranties \
    -H "Authorization: Bearer ${token}")"
grep -q "Docker Smoke Router" <<< "${list_resp}" \
    || fail "GET /api/warranties did not return created warranty"

# Recreate container with the same /data/uploads volume and no SECRET_KEY env var:
# the JWT issued before recreation must remain valid.
log "   Recreating container to verify persisted SECRET_KEY across restarts..."
stop_app
APP_CTR="warracker-ci-recreate-$$"
docker run -d --name "${APP_CTR}" --network "${NET}" \
    -p 127.0.0.1:18005:80 \
    -v "${VOL}:/data/uploads" \
    -e "DB_HOST=${PG_CTR}" \
    -e "DB_NAME=${DB_NAME}" \
    -e "DB_USER=${DB_USER}" \
    -e "DB_PASSWORD=${DB_PASS}" \
    "${IMAGE}" >/dev/null

wait_for_health "${APP_CTR}" "http://127.0.0.1:18005/api/health"
after_recreate="$(curl -fsS http://127.0.0.1:18005/api/warranties \
    -H "Authorization: Bearer ${token}")"
grep -q "Docker Smoke Router" <<< "${after_recreate}" \
    || fail "JWT failed after container recreate (SECRET_KEY did not persist)"
stop_app

# ---------------------------------------------------------------------------
# 4. DATABASE_URL-only boot (no DB_HOST/DB_NAME/DB_USER/DB_PASSWORD/DB_ADMIN_*)
# ---------------------------------------------------------------------------
log "4/6 Booting with DATABASE_URL only..."
docker exec "${PG_CTR}" psql -U "${DB_USER}" -d postgres \
    -c "CREATE DATABASE warranty_url_db OWNER \"${DB_USER}\";" >/dev/null

APP_CTR="warracker-ci-dburl-$$"
docker run -d --name "${APP_CTR}" --network "${NET}" \
    -p 127.0.0.1:18006:80 \
    -e "DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${PG_CTR}:5432/warranty_url_db" \
    "${IMAGE}" >/dev/null

wait_for_health "${APP_CTR}" "http://127.0.0.1:18006/api/health"
dburl_logs="$(docker logs "${APP_CTR}" 2>&1 || true)"
if grep -q "${DB_PASS}" <<< "${dburl_logs}"; then
    fail "DATABASE_URL password leaked into container logs"
fi
stop_app

# ---------------------------------------------------------------------------
# 5. DISABLE_NGINX=true direct-Gunicorn mode on port 5000
# ---------------------------------------------------------------------------
log "5/6 Booting with DISABLE_NGINX=true on :5000..."
APP_CTR="warracker-ci-nonginx-$$"
docker run -d --name "${APP_CTR}" --network "${NET}" \
    -p 127.0.0.1:18007:5000 \
    -e "DISABLE_NGINX=true" \
    -e "DB_HOST=${PG_CTR}" \
    -e "DB_NAME=${DB_NAME}" \
    -e "DB_USER=${DB_USER}" \
    -e "DB_PASSWORD=${DB_PASS}" \
    "${IMAGE}" >/dev/null

wait_for_health "${APP_CTR}" "http://127.0.0.1:18007/api/health"
if docker exec "${APP_CTR}" python -c "
import glob, sys
comms = []
for p in glob.glob('/proc/[0-9]*/comm'):
    try:
        comms.append(open(p).read().strip())
    except OSError:
        pass
sys.exit(0 if 'nginx' in comms else 1)
"; then
    fail "nginx is running despite DISABLE_NGINX=true"
fi
stop_app

# ---------------------------------------------------------------------------
# 6. Fail-closed negative credential checks
# ---------------------------------------------------------------------------
log "6/6 Verifying fail-closed startup on missing/partial DB credentials..."
set +e
missing_out="$(docker run --rm --network "${NET}" \
    -e "DB_HOST=${PG_CTR}" \
    -e "DB_NAME=${DB_NAME}" \
    -e "DB_USER=${DB_USER}" \
    "${IMAGE}" 2>&1)"
missing_rc=$?
set -e
[ "${missing_rc}" -ne 0 ] || fail "Container unexpectedly succeeded with missing DB_PASSWORD"
grep -q "DB_PASSWORD" <<< "${missing_out}" \
    || fail "Missing-password startup error did not name DB_PASSWORD: ${missing_out}"

set +e
partial_out="$(docker run --rm --network "${NET}" \
    -e "DB_HOST=${PG_CTR}" \
    -e "DB_NAME=${DB_NAME}" \
    -e "DB_USER=${DB_USER}" \
    -e "DB_PASSWORD=${DB_PASS}" \
    -e "DB_ADMIN_USER=warracker_admin" \
    "${IMAGE}" 2>&1)"
partial_rc=$?
set -e
[ "${partial_rc}" -ne 0 ] || fail "Container unexpectedly succeeded with partial DB_ADMIN_USER"
grep -q "DB_ADMIN_PASSWORD" <<< "${partial_out}" \
    || fail "Partial-admin startup error did not name DB_ADMIN_PASSWORD: ${partial_out}"

log "All Docker smoke tests passed!"
