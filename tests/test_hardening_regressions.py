"""Defensive regression tests for the non-breaking hardening pass.

Covers:
- C-01: Local file serving rejects dotfiles (e.g. .secret_key), symlinks,
  and unreferenced files even for admin callers.
- H-01: PUT /api/admin/users/<id> validates boolean types strictly,
  protects owner accounts against all modifications by non-owner admins,
  and enforces case-insensitive email uniqueness.
- H-02: File serving restricts inline rendering to passive MIME types and
  forces attachment + sandbox CSP for active/unrecognized types.
- H-04: SSRF IP guard rejects multicast, RFC 2765/8215 SIIT, and local-use
  NAT64 prefixes alongside existing private/loopback blocks.
- H-05: Docker/Nginx init uses root-only /run/nginx-init and fix_permissions
  never follows symlinks.
- M-01: Frontend escaping and URL control-character sanitization pins.
- M-02: Password reset tokens are single-use (atomic consumption).
- M-03: OIDC string `groups` claim never matches substrings for admin role;
  inactive OIDC users redirect with account_inactive instead of failing.
- M-05: Paperless search-and-link returns identical 404 responses for
  missing vs foreign-owned documents (no title oracle).
- M-06: Global view endpoints omit foreign users' email addresses and
  private "other document" metadata for non-owners/non-admins.
- M-07: Rate limiter buckets are memory-bounded, audit-trail limit is
  clamped, and saved_filters payload is size-capped.
- L-02/L-03/L-04/L-05: Apprise URL scheme redaction, passwordless OIDC
  guard on change-password/change-email, preference time/timezone/frequency
  validation, clearing local file path when switching to Paperless, safe
  DefaultConfig DEBUG=False, and private scheduler snapshot directory.
"""
import base64
import hashlib
import io
import ipaddress
import os
import stat
import subprocess
import types
import uuid
from datetime import datetime, timedelta, UTC
from urllib.parse import parse_qs, urlparse

import pytest

from backend import file_routes, oidc_handler
from backend.apprise_handler import AppriseNotificationHandler
from backend.config import config as app_config_map
from backend.notifications import _master_scheduler_status_path
from backend.rate_limit import _AttemptTracker
from backend.warranties_routes import _ip_address_is_public

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


def _read(relpath):
    with open(os.path.join(REPO_ROOT, relpath), encoding="utf-8") as fh:
        return fh.read()


def _user_row(db_connection, username):
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT id, email, is_admin, is_active, is_owner FROM users WHERE username = %s",
            (username,),
        )
        row = cur.fetchone()
    return {
        "id": row[0],
        "email": row[1],
        "is_admin": row[2],
        "is_active": row[3],
        "is_owner": row[4],
    }


def _set_site_setting(db_connection, key, value):
    with db_connection, db_connection.cursor() as cur:
        if value is None:
            cur.execute("DELETE FROM site_settings WHERE key = %s", (key,))
        else:
            cur.execute(
                "INSERT INTO site_settings (key, value) VALUES (%s, %s) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                (key, value),
            )


def _get_site_setting(db_connection, key):
    with db_connection.cursor() as cur:
        cur.execute("SELECT value FROM site_settings WHERE key = %s", (key,))
        row = cur.fetchone()
        return row[0] if row else None


# ---------------------------------------------------------------------------
# C-01: Local file serving rejects dotfiles, symlinks, and unreferenced files
# ---------------------------------------------------------------------------

def test_c01_blocks_dotfiles_and_unreferenced_files(client, admin_user, user_factory):
    upload_dir = os.environ["UPLOAD_FOLDER"]
    secret_path = os.path.join(upload_dir, ".secret_key")
    created_secret = not os.path.exists(secret_path)
    if created_secret:
        with open(secret_path, "wb") as fh:
            fh.write(b"super-secret-signing-key")

    unref_name = f"unreferenced_{uuid.uuid4().hex[:8]}.pdf"
    unref_path = os.path.join(upload_dir, unref_name)
    with open(unref_path, "wb") as fh:
        fh.write(PDF_BYTES)

    regular = user_factory()
    try:
        # Dotfiles under uploads are always rejected with 400 — even for admins.
        for endpoint in (
            "/api/files/uploads/.secret_key",
            "/api/secure-file/.secret_key",
        ):
            r_admin = client.get(endpoint, headers=admin_user["headers"])
            assert r_admin.status_code == 400, f"{endpoint}: {r_admin.status_code}"
            r_user = client.get(endpoint, headers=regular["headers"])
            assert r_user.status_code == 400, f"{endpoint}: {r_user.status_code}"

        # Non-uploads path prefix stays rejected with 403.
        assert client.get("/api/files/.secret_key", headers=admin_user["headers"]).status_code == 403

        # Unreferenced files on disk cannot be read by admins (404) or users (403).
        for endpoint in (
            f"/api/files/uploads/{unref_name}",
            f"/api/secure-file/{unref_name}",
        ):
            r_admin = client.get(endpoint, headers=admin_user["headers"])
            assert r_admin.status_code == 404, f"{endpoint}: {r_admin.status_code}"
            r_user = client.get(endpoint, headers=regular["headers"])
            assert r_user.status_code == 403, f"{endpoint}: {r_user.status_code}"
    finally:
        if created_secret and os.path.exists(secret_path):
            os.remove(secret_path)
        if os.path.exists(unref_path):
            os.remove(unref_path)


def test_c01_rejects_symlink_inside_upload_folder(app, tmp_path):
    target_file = tmp_path / "outside.txt"
    target_file.write_text("outside-data", encoding="utf-8")
    upload_dir = os.environ["UPLOAD_FOLDER"]
    link_name = f"symlink_{uuid.uuid4().hex[:8]}.txt"
    link_path = os.path.join(upload_dir, link_name)
    os.symlink(str(target_file), link_path)
    try:
        with app.app_context():
            assert file_routes._resolve_upload_file_path(upload_dir, link_name) is None
    finally:
        if os.path.lexists(link_path):
            os.unlink(link_path)


# ---------------------------------------------------------------------------
# H-01: Owner protection & strict boolean validation on admin user update
# ---------------------------------------------------------------------------

def test_h01_owner_protection_and_boolean_validation(
    client, admin_user, user_factory, db_connection
):
    owner = _user_row(db_connection, admin_user["username"])
    assert owner["is_owner"] is True

    co_admin = user_factory()
    co_admin_row = _user_row(db_connection, co_admin["username"])
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE users SET is_admin = TRUE WHERE id = %s", (co_admin_row["id"],))

    # Non-boolean values must be rejected with 400 (no silent falsy bypass).
    for bad_body in (
        {"is_admin": 0},
        {"is_admin": ""},
        {"is_admin": None},
        {"is_admin": "false"},
        {"is_active": 0},
        {"is_active": ""},
        {"is_active": None},
    ):
        r = client.put(
            f"/api/admin/users/{owner['id']}",
            headers=co_admin["headers"],
            json=bad_body,
        )
        assert r.status_code == 400, f"expected 400 for {bad_body}, got {r.status_code}"

    # Non-owner admin cannot modify ANY field on the owner account (including email).
    for forbidden_body in (
        {"is_admin": False},
        {"is_active": False},
        {"email": f"hijack_{uuid.uuid4().hex[:6]}@test.local"},
    ):
        r = client.put(
            f"/api/admin/users/{owner['id']}",
            headers=co_admin["headers"],
            json=forbidden_body,
        )
        assert r.status_code == 403, f"expected 403 for {forbidden_body}, got {r.status_code}"

    owner_after = _user_row(db_connection, admin_user["username"])
    assert owner_after == owner

    # Case-insensitive email conflict detection on regular user update.
    plain_a = user_factory()
    plain_b = user_factory()
    rec_a = _user_row(db_connection, plain_a["username"])
    rec_b = _user_row(db_connection, plain_b["username"])
    r_dup = client.put(
        f"/api/admin/users/{rec_b['id']}",
        headers=admin_user["headers"],
        json={"email": rec_a["email"].upper()},
    )
    assert r_dup.status_code == 400


# ---------------------------------------------------------------------------
# H-02: Safe inline MIME allowlist + CSP / Content-Disposition on file routes
# ---------------------------------------------------------------------------

def test_h02_paperless_active_content_forced_attachment_and_sandboxed(
    client, admin_user, monkeypatch
):
    samples = {
        9801: (b"<html><body><script>1</script></body></html>", "text/html"),
        9802: (b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", "image/svg+xml"),
        9803: (PDF_BYTES, "application/pdf"),
        9804: (PNG_BYTES, "image/png"),
    }

    stub = types.SimpleNamespace(
        get_document_preview=lambda doc_id: (True, samples[doc_id][0], "ok", samples[doc_id][1]),
    )
    monkeypatch.setattr(file_routes, "get_paperless_handler", lambda conn: stub)

    # Active types: downgraded to application/octet-stream + attachment + CSP sandbox.
    for doc_id in (9801, 9802):
        r = client.get(f"/api/paperless-file/{doc_id}", headers=admin_user["headers"])
        assert r.status_code == 200, r.get_data(as_text=True)
        assert r.headers.get("Content-Type", "").startswith("application/octet-stream")
        assert r.headers.get("Content-Disposition", "").startswith("attachment")
        assert r.headers.get("Content-Security-Policy") == "sandbox"
        assert r.headers.get("X-Content-Type-Options") == "nosniff"

    # Passive types: stay inline with frame-ancestors 'self' (compatible with Chrome PDF viewer).
    for doc_id, expected_ct in ((9803, "application/pdf"), (9804, "image/png")):
        r = client.get(f"/api/paperless-file/{doc_id}", headers=admin_user["headers"])
        assert r.status_code == 200, r.get_data(as_text=True)
        assert r.headers.get("Content-Type", "").startswith(expected_ct)
        assert r.headers.get("Content-Disposition", "").startswith("inline")
        assert r.headers.get("Content-Security-Policy") == "default-src 'none'; frame-ancestors 'self'"
        assert r.headers.get("X-Content-Type-Options") == "nosniff"


# ---------------------------------------------------------------------------
# H-04: SSRF IP classification edge cases
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "addr",
    [
        "::ffff:0:127.0.0.1",
        "::ffff:0:169.254.169.254",
        "64:ff9b:1::10.0.0.1",
        "64:ff9b:1::169.254.169.254",
        "224.0.0.1",
        "239.255.255.250",
        "ff02::1",
        "::ffff:224.0.0.1",
        "255.255.255.255",
    ],
)
def test_h04_ssrf_rejects_multicast_siit_and_local_nat64(addr):
    assert not _ip_address_is_public(ipaddress.ip_address(addr))


@pytest.mark.parametrize(
    "addr",
    [
        "8.8.8.8",
        "1.1.1.1",
        "::ffff:8.8.8.8",
        "2001:4860:4860::8888",
    ],
)
def test_h04_ssrf_still_allows_public_unicast(addr):
    assert _ip_address_is_public(ipaddress.ip_address(addr))


# ---------------------------------------------------------------------------
# H-05: Container root/warracker privilege separation & symlink-safe chown
# ---------------------------------------------------------------------------

def test_h05_docker_and_fix_permissions_hardening(tmp_path, monkeypatch):
    dockerfile = _read("Dockerfile")
    wrapper = _read("Docker/nginx-wrapper.sh")
    assert "chown -R root:root /app /var/www/html" in dockerfile
    assert "/run/nginx-init" in dockerfile
    assert "/run/nginx-init/default.conf" in wrapper
    assert "/tmp/nginx-default.conf" not in wrapper

    # Verify fix_permissions skips symlinks and uses lchown (never follows links).
    from backend import fix_permissions as fp

    outside_file = tmp_path / "outside.txt"
    outside_file.write_text("keep-me", encoding="utf-8")
    data_dir = tmp_path / "data"
    uploads_dir = data_dir / "uploads"
    uploads_dir.mkdir(parents=True)
    real_file = uploads_dir / "invoice.pdf"
    real_file.write_bytes(PDF_BYTES)
    symlink_file = uploads_dir / "escape_link"
    symlink_file.symlink_to(outside_file)

    chowned = []
    monkeypatch.setenv("UPLOAD_FOLDER", str(uploads_dir))
    monkeypatch.setattr(os, "lchown", lambda path, uid, gid: chowned.append(os.path.abspath(path)))

    fp.fix_upload_folder_permissions()

    assert os.path.abspath(str(real_file)) in chowned
    assert os.path.abspath(str(symlink_file)) not in chowned
    assert os.path.abspath(str(outside_file)) not in chowned


# ---------------------------------------------------------------------------
# M-01: Frontend escaping & URL control-character sanitization pins
# ---------------------------------------------------------------------------

def test_m01_frontend_xss_and_url_sanitizer_pins():
    login_html = _read("frontend/login.html")
    assert "oidcButton.innerHTML =" not in login_html
    assert "document.createTextNode" in login_html

    settings_js = _read("frontend/settings-new.js")
    assert "escapeHtmlSafe(log.ip_address" in settings_js
    assert "<td>${log.ip_address" not in settings_js

    script_js = _read("frontend/script.js")
    assert 'Create "${searchTerm}"' not in script_js
    assert 'Create "${escapeHtml(searchTerm)}"' in script_js
    assert '<i class="fas fa-file"></i> ${escapeHtml(fileType)}' in script_js
    assert '<i class="fas fa-file"></i> ${fileType}' not in script_js

    paperless_js = _read("frontend/js/components/paperless.js")
    assert "<p>${message}</p>" not in paperless_js
    assert "SAFE_INLINE_BLOB_MIME_TYPES" in paperless_js

    currency_js = _read("frontend/js/lib/currency.js")
    assert "const safeSymbol = String(symbol ?? '').replace(" in currency_js
    assert "${symbol}</span>" not in currency_js

    status_js = _read("frontend/status.js")
    assert "toast.innerHTML =" not in status_js
    assert "document.createTextNode" in status_js
    assert r"[\u0000-\u0020\u007f]+" in status_js

    renderer_js = _read("frontend/js/components/warrantyRenderer.js")
    assert r"[\u0000-\u0020\u007f]+" in renderer_js

    # Execute Node to confirm control-char-obfuscated javascript: URLs are neutralized.
    node_code = (
        "const sanitizeUrl = (url = '') => {"
        "  if (!url) return '';"
        "  const trimmed = String(url).trim();"
        "  const normalized = trimmed.replace(/[\\u0000-\\u0020\\u007f]+/g, '');"
        "  if (/^(javascript|data|vbscript):/i.test(normalized)) return '#';"
        "  return trimmed;"
        "};"
        "const assert = require('assert');"
        "assert.strictEqual(sanitizeUrl('java\\tscript:alert(1)'), '#');"
        "assert.strictEqual(sanitizeUrl('\\x01javascript:alert(1)'), '#');"
        "assert.strictEqual(sanitizeUrl('https://example.com/item'), 'https://example.com/item');"
    )
    subprocess.run(["node", "-e", node_code], check=True)


# ---------------------------------------------------------------------------
# M-02: Single-use password reset token
# ---------------------------------------------------------------------------

def test_m02_password_reset_token_is_single_use(client, user_factory, db_connection):
    user = user_factory()
    row = _user_row(db_connection, user["username"])
    raw_token = "reset-" + uuid.uuid4().hex
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) "
            "VALUES (%s, %s, %s)",
            (row["id"], token_hash, datetime.now(UTC) + timedelta(minutes=15)),
        )

    r1 = client.post(
        "/api/auth/password/reset",
        json={"token": raw_token, "password": "NewStrongPassword123!"},
    )
    assert r1.status_code == 200, r1.get_data(as_text=True)

    r2 = client.post(
        "/api/auth/password/reset",
        json={"token": raw_token, "password": "AnotherPassword456!"},
    )
    assert r2.status_code == 400


# ---------------------------------------------------------------------------
# M-03 & L-03: OIDC string groups check & inactive OIDC user handling
# ---------------------------------------------------------------------------

class _GroupsOIDCClient:
    def __init__(self, sub, email, groups):
        self._sub = sub
        self._email = email
        self._groups = groups

    def authorize_access_token(self):
        return {
            "userinfo": {
                "sub": self._sub,
                "iss": "https://idp.example.com",
                "email": self._email,
                "given_name": "Group",
                "family_name": "Tester",
                "groups": self._groups,
            }
        }

    def userinfo(self, token=None):
        return {"sub": self._sub, "email": self._email, "groups": self._groups}


def test_m03_oidc_string_groups_no_substring_admin_and_l03_inactive_redirect(
    client, app, monkeypatch, db_connection
):
    prev_group = _get_site_setting(db_connection, "admin_oidc_group")
    _set_site_setting(db_connection, "admin_oidc_group", "admin")
    app.config["OIDC_ENABLED"] = True
    app.config["OIDC_PROVIDER_NAME"] = "testidp"

    sub_str = "sub-str-" + uuid.uuid4().hex
    email_str = f"oidc-str-{uuid.uuid4().hex[:8]}@example.com"
    sub_list = "sub-list-" + uuid.uuid4().hex
    email_list = f"oidc-list-{uuid.uuid4().hex[:8]}@example.com"

    try:
        # String claim "non-admin" contains substring "admin" — MUST NOT grant admin.
        monkeypatch.setattr(
            oidc_handler.oauth,
            "create_client",
            lambda name: _GroupsOIDCClient(sub_str, email_str, "non-admin"),
        )
        r = client.get("/api/oidc/callback")
        assert r.status_code == 302, r.get_data(as_text=True)
        with db_connection.cursor() as cur:
            cur.execute("SELECT id, is_admin FROM users WHERE oidc_sub = %s", (sub_str,))
            uid_str, is_admin_str = cur.fetchone()
        assert is_admin_str is False

        # L-03: Deactivating the OIDC user must redirect cleanly with account_inactive.
        with db_connection, db_connection.cursor() as cur:
            cur.execute("UPDATE users SET is_active = FALSE WHERE id = %s", (uid_str,))
        r_inactive = client.get("/api/oidc/callback")
        assert r_inactive.status_code == 302
        qs = parse_qs(urlparse(r_inactive.headers["Location"]).query)
        assert qs.get("oidc_error") == ["account_inactive"]

        # Proper list claim ["admin"] still grants admin as intended.
        monkeypatch.setattr(
            oidc_handler.oauth,
            "create_client",
            lambda name: _GroupsOIDCClient(sub_list, email_list, ["users", "admin"]),
        )
        r2 = client.get("/api/oidc/callback")
        assert r2.status_code == 302, r2.get_data(as_text=True)
        with db_connection.cursor() as cur:
            cur.execute("SELECT is_admin FROM users WHERE oidc_sub = %s", (sub_list,))
            assert cur.fetchone()[0] is True
    finally:
        app.config["OIDC_ENABLED"] = False
        app.config.pop("OIDC_PROVIDER_NAME", None)
        _set_site_setting(db_connection, "admin_oidc_group", prev_group)


# ---------------------------------------------------------------------------
# M-05: Paperless search-and-link error parity (no title existence oracle)
# ---------------------------------------------------------------------------

def test_m05_paperless_search_and_link_no_title_oracle(
    client, user_factory, warranty_factory, paperless_configured
):
    owner = user_factory()
    attacker = user_factory()
    unique_title = f"OwnerPrivateInvoice-{uuid.uuid4().hex[:8]}"

    # Owner uploads a unique document (automatically recorded as owned by owner),
    # leaving mock document id 1 untouched for test_paperless_security.py.
    r_up = client.post(
        "/api/paperless/upload",
        headers=owner["headers"],
        data={
            "file": (io.BytesIO(PDF_BYTES), "owner_invoice.pdf"),
            "title": unique_title,
        },
        content_type="multipart/form-data",
    )
    assert r_up.status_code == 200, r_up.get_data(as_text=True)

    w_resp = warranty_factory(attacker["headers"], product_name="OracleProbe")
    assert w_resp.status_code == 201
    wid = w_resp.get_json()["id"]

    r_foreign = client.post(
        "/api/paperless-search-and-link",
        headers=attacker["headers"],
        json={
            "warranty_id": wid,
            "document_type": "invoice",
            "search_title": unique_title,
        },
    )
    r_missing = client.post(
        "/api/paperless-search-and-link",
        headers=attacker["headers"],
        json={
            "warranty_id": wid,
            "document_type": "invoice",
            "search_title": "Definitely Missing Document Title 99999",
        },
    )

    assert r_foreign.status_code == 404
    assert r_missing.status_code == 404
    assert r_foreign.get_json() == r_missing.get_json() == {
        "success": False,
        "message": "Document not found",
    }


# ---------------------------------------------------------------------------
# M-06: Global view omits foreign email & private other_document fields
# ---------------------------------------------------------------------------

def test_m06_global_view_redacts_foreign_email_and_other_document(
    client, admin_user, user_factory, db_connection
):
    prev_enabled = _get_site_setting(db_connection, "global_view_enabled")
    prev_admin_only = _get_site_setting(db_connection, "global_view_admin_only")
    _set_site_setting(db_connection, "global_view_enabled", "true")
    _set_site_setting(db_connection, "global_view_admin_only", "false")

    owner = user_factory()
    viewer = user_factory()

    try:
        r_create = client.post(
            "/api/warranties",
            headers=owner["headers"],
            data={
                "product_name": f"PrivateDocWidget_{uuid.uuid4().hex[:6]}",
                "purchase_date": "2025-02-01",
                "exact_expiration_date": "2028-02-01",
                "other_document": (io.BytesIO(PDF_BYTES), "private_note.pdf"),
                "other_document_url": "https://private.example.invalid/secret-doc",
            },
            content_type="multipart/form-data",
        )
        assert r_create.status_code == 201, r_create.get_data(as_text=True)
        wid = r_create.get_json()["id"]

        with db_connection, db_connection.cursor() as cur:
            cur.execute(
                "UPDATE warranties SET paperless_other_id = 7777 WHERE id = %s",
                (wid,),
            )

        # 1. /api/warranties/global
        g_viewer = client.get("/api/warranties/global", headers=viewer["headers"]).get_json()
        entry_v = next(w for w in g_viewer if w["id"] == wid)
        assert "email" not in entry_v
        assert entry_v["other_document_path"] is None
        assert entry_v["other_document_url"] is None
        assert entry_v["paperless_other_id"] is None

        # Owner and admin still see their fields.
        g_owner = client.get("/api/warranties/global", headers=owner["headers"]).get_json()
        entry_o = next(w for w in g_owner if w["id"] == wid)
        assert entry_o["other_document_path"] is not None
        assert entry_o["other_document_url"] == "https://private.example.invalid/secret-doc"
        assert entry_o["paperless_other_id"] == 7777

        g_admin = client.get("/api/warranties/global", headers=admin_user["headers"]).get_json()
        entry_a = next(w for w in g_admin if w["id"] == wid)
        assert "email" in entry_a
        assert entry_a["other_document_path"] is not None

        # 2. /api/debug/warranty/<id>
        dbg_viewer = client.get(
            f"/api/debug/warranty/{wid}", headers=viewer["headers"]
        ).get_json()
        assert "email" not in dbg_viewer
        assert dbg_viewer["other_document_path"] is None
        assert dbg_viewer["paperless_other_id"] is None

        # 3. /api/statistics/global
        stats_viewer = client.get(
            "/api/statistics/global", headers=viewer["headers"]
        ).get_json()
        stat_item = next(
            w for w in stats_viewer["all_warranties"] if w["id"] == wid
        )
        assert "email" not in stat_item
        assert stat_item["other_document_path"] is None
        for rec in stats_viewer.get("recent_warranties", []):
            if rec["id"] == wid:
                assert "email" not in rec
                assert rec["other_document_path"] is None

        # 4. /api/warranties/global/archived
        r_arch = client.patch(
            f"/api/warranties/{wid}/archive",
            headers=owner["headers"],
            json={"archived": True},
        )
        assert r_arch.status_code == 200
        arch_viewer = client.get(
            "/api/warranties/global/archived", headers=viewer["headers"]
        ).get_json()
        arch_entry = next(w for w in arch_viewer if w["id"] == wid)
        assert "email" not in arch_entry
        assert arch_entry["other_document_path"] is None
        assert arch_entry["other_document_url"] is None
        assert arch_entry["paperless_other_id"] is None
    finally:
        _set_site_setting(db_connection, "global_view_enabled", prev_enabled)
        _set_site_setting(db_connection, "global_view_admin_only", prev_admin_only)


# ---------------------------------------------------------------------------
# M-07: Bounded rate-limit buckets, audit-trail clamp, saved_filters size cap
# ---------------------------------------------------------------------------

def test_m07_rate_limiter_buckets_are_bounded():
    tracker = _AttemptTracker(max_keys=20, default_window=60)
    for i in range(50):
        tracker.record(f"key-{i}")
    assert len(tracker._attempts) <= 20


def test_m07_audit_trail_limit_clamped_and_saved_filters_capped(
    client, admin_user, user_factory
):
    r_audit = client.get(
        "/api/admin/audit-trail?limit=999999999", headers=admin_user["headers"]
    )
    assert r_audit.status_code == 200
    assert len(r_audit.get_json()) <= 1000

    user = user_factory()
    huge_filters = {"blob": "A" * 70000}
    r_big = client.put(
        "/api/auth/preferences", headers=user["headers"], json={"saved_filters": huge_filters}
    )
    assert r_big.status_code == 400


# ---------------------------------------------------------------------------
# L-02 / L-03 / L-04 / L-05
# ---------------------------------------------------------------------------

def test_l02_apprise_safe_url_scheme_redacts_secrets():
    assert AppriseNotificationHandler._safe_url_scheme("discord://123456789/secret_webhook_token") == "discord"
    assert AppriseNotificationHandler._safe_url_scheme("https://user:supersecret@hooks.example.com/tok") == "https"
    assert AppriseNotificationHandler._safe_url_scheme("not-a-url") == "unknown"


def test_l03_passwordless_user_change_password_and_email_return_400(
    client, user_factory, db_connection
):
    user = user_factory()
    row = _user_row(db_connection, user["username"])
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE users SET password_hash = NULL WHERE id = %s", (row["id"],))

    r_pw = client.post(
        "/api/auth/password/change",
        headers=user["headers"],
        json={"current_password": "anything", "new_password": "NewPassword123!"},
    )
    assert r_pw.status_code == 400

    r_em = client.post(
        "/api/auth/change-email",
        headers=user["headers"],
        json={"new_email": f"new_{uuid.uuid4().hex[:6]}@test.local", "password": "anything"},
    )
    assert r_em.status_code == 400


def test_l03_preferences_validate_time_timezone_frequency_and_allow_empty(
    client, user_factory
):
    user = user_factory()
    h = user["headers"]

    # Seed valid preferences first.
    r_ok = client.put(
        "/api/auth/preferences",
        headers=h,
        json={
            "timezone": "America/New_York",
            "apprise_timezone": "Europe/London",
            "notification_time": "08:30",
            "apprise_notification_time": "17:45",
            "notification_frequency": "weekly",
            "apprise_notification_frequency": "monthly",
        },
    )
    assert r_ok.status_code == 200, r_ok.get_data(as_text=True)

    # Invalid values must return 400.
    for bad in (
        {"timezone": "Mars/Olympus_Mons"},
        {"apprise_timezone": "Not/A_Zone"},
        {"notification_time": "25:99"},
        {"apprise_notification_time": "morning"},
        {"notification_frequency": "hourly"},
        {"apprise_notification_frequency": "never"},
    ):
        r_bad = client.put("/api/auth/preferences", headers=h, json=bad)
        assert r_bad.status_code == 400, f"expected 400 for {bad}, got {r_bad.status_code}"

    # Empty strings sent by partially-loaded UI dropdowns must NOT error or wipe values.
    r_empty = client.put(
        "/api/auth/preferences",
        headers=h,
        json={"timezone": "", "notification_time": "", "notification_frequency": ""},
    )
    assert r_empty.status_code == 200
    body = r_empty.get_json()
    assert body["timezone"] == "America/New_York"
    assert body["notification_time"] == "08:30"
    assert body["notification_frequency"] == "weekly"


def test_l04_switching_local_invoice_to_paperless_clears_local_path(
    client, user_factory, db_connection
):
    user = user_factory()
    r = client.post(
        "/api/warranties",
        headers=user["headers"],
        data={
            "product_name": "SwitchToPaperless",
            "purchase_date": "2025-03-01",
            "exact_expiration_date": "2027-03-01",
            "invoice": (io.BytesIO(PDF_BYTES), "local_inv.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert r.status_code == 201, r.get_data(as_text=True)
    wid = r.get_json()["id"]

    r_upd = client.put(
        f"/api/warranties/{wid}",
        headers=user["headers"],
        data={
            "product_name": "SwitchToPaperless",
            "purchase_date": "2025-03-01",
            "exact_expiration_date": "2027-03-01",
            "paperless_invoice_id": "8844",
        },
        content_type="multipart/form-data",
    )
    assert r_upd.status_code == 200, r_upd.get_data(as_text=True)

    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT invoice_path, paperless_invoice_id FROM warranties WHERE id = %s",
            (wid,),
        )
        inv_path, ppl_id = cur.fetchone()
    assert inv_path is None
    assert ppl_id == 8844


def test_l05_default_config_safe_and_scheduler_snapshot_dir_private():
    default_cfg = app_config_map["default"]
    assert default_cfg.DEBUG is False
    assert default_cfg.PROPAGATE_EXCEPTIONS is False

    snap_path = _master_scheduler_status_path()
    snap_dir = os.path.dirname(snap_path)
    st = os.stat(snap_dir)
    assert stat.S_IMODE(st.st_mode) == 0o700
    assert st.st_uid == os.getuid()
