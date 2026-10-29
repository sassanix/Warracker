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
