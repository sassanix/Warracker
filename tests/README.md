# Warracker test suite

API tests for the Flask backend, run with pytest. The suite boots the
real application against a dedicated PostgreSQL database that is
dropped and recreated on every run, with the production migrations
applied. The only fake is Paperless-ngx (`mock_paperless.py`).

## Running locally

You need a PostgreSQL server and a role that can create databases
(the suite creates and drops its own database).

```bash
pip install -r backend/requirements.txt
pip install pytest

DB_HOST=127.0.0.1 DB_PORT=5432 \
DB_NAME=warranty_test_suite \
DB_USER=warranty_user DB_PASSWORD=<your-dev-password> \
python -m pytest
```

Environment variables (defaults in `conftest.py`): `DB_HOST`,
`DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. `SECRET_KEY` and
`UPLOAD_FOLDER` are set to throwaway test values automatically.

CI runs the same suite on every pull request
(`.github/workflows/tests.yml`).

## What's covered

- `test_smoke.py` — health endpoint, auth required, login, warranty
  create/read/update/delete.
- `test_validation_and_stats.py` — product-name length limit,
  expiration-before-purchase rejection (create and update),
  statistics bucket boundaries (expiring today is not expired),
  claim status validation, CSV import tag splitting, serial-number
  and tag-name limits, whitespace-only product name, passwords over
  72 characters rejected with a 400, claim-document file-type check,
  and the JSON 413 for oversized uploads (the suite caps uploads at
  1 MB via `MAX_UPLOAD_MB` so this stays fast).
- `test_file_access.py` — local file authorization (the
  GHSA-w3rm-8qhv-w3f5 IDOR surface): owner and admin get everything;
  other users get the global-view-shared types (photo, invoice,
  manual) but never "other documents" or claim documents; missing
  files return a JSON 404.
- `test_db_credentials_required.py` — required `DB_USER`/`DB_PASSWORD`
  (or `DATABASE_URL` with credentials) with zero built-in defaults (#221),
  optional paired `DB_ADMIN_USER`/`DB_ADMIN_PASSWORD`, and end-to-end
  `apply_migrations.py`, `fix_permissions.py`, and `Docker/entrypoint.sh`
  checks.
- `test_warranty_lifecycle_and_global_view.py` — archive/unarchive,
  void/unvoid, cross-user ownership boundaries (stranger vs admin),
  global view visibility modes (`global`, `global/archived`,
  `global-view-status`), `admin/warranties`, `timezones`, and `locales`.
- `test_warranty_expiry_history.py` — expiration date and lifetime
  change history (#209): recording transitions on edit with optional
  reason, length validation, `expiry_change_count` across list/debug/
  statistics endpoints, global-view access control, cascade/nullability,
  and XSS-safe DOM rendering.
- `test_claims_crud_and_access.py` — full claim CRUD lifecycle,
  `claim_status_summary` transitions, claim document upload/delete disk
  cleanup, and cross-user claim/document privacy under global view.
- `test_tags_crud.py` — tag create/update/delete validation, per-user
  uniqueness, non-owner 403 enforcement, and warranty-tag routes.
- `test_user_account_and_preferences.py` — user preferences validation
  and persistence, language preference, registration gate, self account
  deletion, admin user deletion protections, and audit trail.
- `test_frontend_and_locales.py` — `node --check` syntax checks across
  all frontend JS files and inline HTML scripts, pure JS date/currency
  helper tests, locale JSON completeness vs `SUPPORTED_LANGUAGES`, and
  frontend version-string lockstep.
- `docker_smoke_test.sh` — end-to-end container smoke tests run in
  `.github/workflows/docker-build.yml`: Compose config validation,
  default 4-var stack boot with gevent workers, nginx security headers
  and `Server` banner check, API CRUD + persisted `SECRET_KEY` across
  container recreation, `DATABASE_URL`-only boot, `DISABLE_NGINX=true`
  mode, and fail-closed missing/partial DB credential checks.
- `test_notifications.py` — notification selection: the expiring-soon
  query includes in-window warranties and excludes expired, lifetime,
  archived and voided ones, and honors each user's own
  expiring_soon_days preference.
- `test_migration_upgrade.py` — upgrade path: a database built with
  the pre-1.0.4 migration set (000-051) upgrades to the current
  schema with its data intact.
- `test_photo_url.py` — product photo by URL (#207): the server
  downloads the image once and stores it like an upload; redirects are
  followed, non-images are rejected, an uploaded file wins over a URL,
  and the SSRF guard rejects non-public hosts.
- `test_statistics.py` — void status drops a warranty out of Total
  Value and the active counts and into the voided count (#250);
  Total Value counts no-currency and NULL-currency rows as the
  user's currency and excludes foreign-currency rows (#192).
- `test_paperless_security.py` — the Paperless-ngx access-control
  battery from GHSA-fv62-3hrm-gf83 / GHSA-3h89-rqfj-5674: cross-user
  search/download/link blocking, claim-document privacy, first-linker
  ownership, admin access, global-view rules (viewing shared,
  linking never).

## Notes

- Tests within `test_paperless_security.py` share a module-scoped
  scenario (users, uploads, links) and run in file order, like the
  script they were ported from.
- Everything else uses a fresh registered user per test, so tests
  stay independent and statistics counts stay isolated.
- Add tests with the feature: a fix for a bug should land with the
  test that would have caught it.
