"""Defensive regression tests for the second (safe/non-breaking) hardening pass.

Covers:
- H-03: Nginx trusted-proxy forwarded-header handling, Gunicorn scoped
  forwarded_allow_ips, and OIDC redirect_uri pinning to APP_BASE_URL.
- M-05: Opt-in paperless_strict_ownership toggle (default false; blocks
  non-admin claiming of unowned Paperless docs only when enabled).
- M-08: Removal of duplicate Nginx CORS, X-Debug-Message, /test-uploads,
  and remote Buy Me a Coffee JS widget; global X-Content-Type-Options: nosniff.
- L-01: Header-only JWT auth (rejects ?token= and form auth_token) and
  Service Worker exclusion of /api/ and Cache-Control: no-store.
- L-03: Passwordless OIDC account deletion still works without password,
  unreferenced uploaded files are removed on account/user deletion, and
  password-reset emails dispatch asynchronously (no SMTP timing oracle).
- M-01: Backend HTTP(S) URL scheme allowlist (with bare-domain https://
  normalization) on warranty create, update, and CSV import.
"""
import io
import os
import threading
import time
import types
import uuid

import pytest

from backend import auth_routes, oidc_handler
from backend.admin_routes import SITE_SETTING_KEYS
from backend.warranties_routes import _validate_http_url

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def _read(relpath):
    with open(os.path.join(REPO_ROOT, relpath), encoding="utf-8") as fh:
        return fh.read()


def _user_id(db_connection, username):
    with db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()[0]


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
# H-03: Forwarded-header hardening & OIDC redirect_uri pinning
# ---------------------------------------------------------------------------

def test_h03_nginx_and_gunicorn_forwarded_header_hardening(monkeypatch):
    nginx_conf = _read("nginx.conf")
    assert "geo $warracker_trusted_proxy" in nginx_conf
    assert 'map "$warracker_trusted_proxy:$http_x_forwarded_proto" $warracker_forwarded_proto' in nginx_conf
    assert 'proxy_set_header X-Forwarded-Proto $warracker_forwarded_proto;' in nginx_conf
    assert 'proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;' not in nginx_conf
    assert 'proxy_set_header X-Forwarded-Host "";' in nginx_conf
    assert 'proxy_set_header X-Forwarded-Prefix "";' in nginx_conf

    # Test _resolve_forwarded_allow_ips without triggering gevent monkey patching.
    gconf_src = _read("backend/gunicorn_config.py")
    ns = {"os": os}
    fn_start = gconf_src.index("def _resolve_forwarded_allow_ips():")
    fn_end = gconf_src.index("\nforwarded_allow_ips =")
    exec(gconf_src[fn_start:fn_end], ns)
    resolve = ns["_resolve_forwarded_allow_ips"]

    for var in ("GUNICORN_FORWARDED_ALLOW_IPS", "TRUST_PROXY_HEADERS", "DISABLE_NGINX"):
        monkeypatch.delenv(var, raising=False)
    assert resolve() == "127.0.0.1,::1"

    monkeypatch.setenv("DISABLE_NGINX", "true")
    assert "172.16.0.0/12" in resolve()
    assert resolve() != "*"

    monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
    assert resolve() == "*"

    monkeypatch.setenv("TRUST_PROXY_HEADERS", "false")
    assert resolve() == ""

    monkeypatch.setenv("GUNICORN_FORWARDED_ALLOW_IPS", "10.0.0.5")
    assert resolve() == "10.0.0.5"


def test_h03_oidc_login_uses_configured_app_base_url(client, app, monkeypatch):
    captured = {}

    class _StubOIDCClient:
        def authorize_redirect(self, redirect_uri):
            captured["redirect_uri"] = redirect_uri
            return ("ok", 200)

    monkeypatch.setattr(oidc_handler.oauth, "create_client", lambda name: _StubOIDCClient())
    monkeypatch.setenv("APP_BASE_URL", "https://warracker.trusted.example")
    app.config["OIDC_ENABLED"] = True
    app.config["OIDC_PROVIDER_NAME"] = "testidp"
    try:
        r = client.get(
            "/api/oidc/login",
            headers={
                "Host": "evil.attacker.invalid",
                "X-Forwarded-Host": "evil.attacker.invalid",
                "X-Forwarded-Proto": "http",
            },
        )
        assert r.status_code == 200
        assert captured["redirect_uri"] == "https://warracker.trusted.example/api/oidc/callback"
    finally:
        app.config["OIDC_ENABLED"] = False
        app.config.pop("OIDC_PROVIDER_NAME", None)


# ---------------------------------------------------------------------------
# M-05: Opt-in paperless_strict_ownership toggle
# ---------------------------------------------------------------------------

def test_m05_paperless_strict_ownership_opt_in(
    client, admin_user, user_factory, warranty_factory, paperless_configured, db_connection
):
    assert "paperless_strict_ownership" in SITE_SETTING_KEYS
    prev = _get_site_setting(db_connection, "paperless_strict_ownership")

    # Default must be false so existing workflows are unaffected.
    r_get = client.get("/api/admin/settings", headers=admin_user["headers"])
    assert r_get.status_code == 200
    assert r_get.get_json().get("paperless_strict_ownership") == "false"

    regular = user_factory()
    unowned_doc_id = "99542"
    try:
        # Turn strict ownership ON via admin settings API.
        r_put = client.put(
            "/api/admin/settings",
            headers=admin_user["headers"],
            json={"paperless_strict_ownership": "true"},
        )
        assert r_put.status_code == 200

        # Non-admin CANNOT claim an unowned Paperless document when strict mode is on.
        r_blocked = warranty_factory(
            regular["headers"],
            product_name="StrictBlocked",
            paperless_invoice_id=unowned_doc_id,
        )
        assert r_blocked.status_code == 403

        # Non-admin CAN still upload and link their own document.
        r_up = client.post(
            "/api/paperless/upload",
            headers=regular["headers"],
            data={
                "file": (io.BytesIO(PDF_BYTES), "mine.pdf"),
                "title": f"StrictOwn-{uuid.uuid4().hex[:6]}",
            },
            content_type="multipart/form-data",
        )
        assert r_up.status_code == 200, r_up.get_data(as_text=True)
        own_doc_id = str(r_up.get_json()["document_id"])
        r_own = warranty_factory(
            regular["headers"],
            product_name="StrictOwnAllowed",
            paperless_invoice_id=own_doc_id,
        )
        assert r_own.status_code == 201, r_own.get_data(as_text=True)

        # Admin CAN still link an unowned document.
        r_admin = warranty_factory(
            admin_user["headers"],
            product_name="StrictAdminAllowed",
            paperless_invoice_id=unowned_doc_id,
        )
        assert r_admin.status_code == 201, r_admin.get_data(as_text=True)
    finally:
        _set_site_setting(db_connection, "paperless_strict_ownership", prev or "false")


# ---------------------------------------------------------------------------
# M-08: Nginx cleanup, nosniff, and static about.html donation button
# ---------------------------------------------------------------------------

def test_m08_nginx_cleanup_and_static_bmc_button():
    nginx_conf = _read("nginx.conf")
    assert "Access-Control-Allow-Origin" not in nginx_conf
    assert "X-Debug-Message" not in nginx_conf
    assert "/test-uploads" not in nginx_conf
    assert "buymeacoffee.com" not in nginx_conf

    about_html = _read("frontend/about.html")
    assert "cdnjs.buymeacoffee.com" not in about_html
    assert 'href="https://www.buymeacoffee.com/sassanix"' in about_html
    assert 'rel="noopener noreferrer"' in about_html


# ---------------------------------------------------------------------------
# L-01: Header-only JWT and Service Worker API/no-store exclusions
# ---------------------------------------------------------------------------

def test_l01_rejects_query_and_form_tokens_and_sw_skips_api(client, user_factory):
    user = user_factory()
    raw_jwt = user["headers"]["Authorization"].split(" ", 1)[1]

    # Header works.
    assert client.get("/api/auth/user", headers=user["headers"]).status_code == 200

    # Query-string ?token= is rejected.
    r_qs = client.get(f"/api/auth/user?token={raw_jwt}")
    assert r_qs.status_code == 401

    # Form field auth_token is rejected.
    r_form = client.post(
        "/api/warranties",
        data={
            "auth_token": raw_jwt,
            "product_name": "ShouldFail",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2027-01-01",
        },
    )
    assert r_form.status_code == 401

    sw_js = _read("frontend/sw.js")
    assert "requestUrl.pathname.startsWith('/api/')" in sw_js
    assert "no-store" in sw_js


# ---------------------------------------------------------------------------
# L-03: Passwordless OIDC deletion, file cleanup on delete, async reset email
# ---------------------------------------------------------------------------

def test_l03_passwordless_oidc_self_delete_and_file_cleanup(
    client, admin_user, user_factory, db_connection
):
    upload_dir = os.environ["UPLOAD_FOLDER"]

    # 1. Self-deletion of a passwordless OIDC account works without a password
    #    and deletes its uploaded warranty + claim files from disk.
    oidc_user = user_factory()
    oidc_uid = _user_id(db_connection, oidc_user["username"])
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE users SET password_hash = NULL WHERE id = %s", (oidc_uid,))

    # GET /api/auth/user reports has_password=False for passwordless accounts.
    me = client.get("/api/auth/user", headers=oidc_user["headers"]).get_json()
    assert me["has_password"] is False

    r_w = client.post(
        "/api/warranties",
        headers=oidc_user["headers"],
        data={
            "product_name": "OidcDeleteCleanup",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2027-01-01",
            "invoice": (io.BytesIO(PDF_BYTES), "oidc_inv.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert r_w.status_code == 201
    wid = r_w.get_json()["id"]
    with db_connection.cursor() as cur:
        cur.execute("SELECT invoice_path FROM warranties WHERE id = %s", (wid,))
        inv_rel = cur.fetchone()[0]
    inv_disk = os.path.join(upload_dir, os.path.basename(inv_rel))
    assert os.path.exists(inv_disk)

    r_del = client.delete("/api/auth/account", headers=oidc_user["headers"])
    assert r_del.status_code == 200, r_del.get_data(as_text=True)
    assert not os.path.exists(inv_disk)

    # 2. Admin deletion of a user also removes their unreferenced uploaded files.
    victim = user_factory()
    victim_uid = _user_id(db_connection, victim["username"])
    r_vw = client.post(
        "/api/warranties",
        headers=victim["headers"],
        data={
            "product_name": "AdminDeleteCleanup",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2027-01-01",
            "manual": (io.BytesIO(PDF_BYTES), "victim_manual.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert r_vw.status_code == 201
    vwid = r_vw.get_json()["id"]
    with db_connection.cursor() as cur:
        cur.execute("SELECT manual_path FROM warranties WHERE id = %s", (vwid,))
        man_rel = cur.fetchone()[0]
    man_disk = os.path.join(upload_dir, os.path.basename(man_rel))
    assert os.path.exists(man_disk)

    r_adel = client.delete(f"/api/admin/users/{victim_uid}", headers=admin_user["headers"])
    assert r_adel.status_code == 200, r_adel.get_data(as_text=True)
    assert not os.path.exists(man_disk)


def test_l03_password_reset_email_dispatched_async(client, user_factory, monkeypatch):
    user = user_factory()
    email = f"{user['username']}@test.local"
    called = threading.Event()

    def _slow_mail(recipient, link):
        called.set()
        time.sleep(1.0)
        return True

    monkeypatch.setattr(auth_routes, "send_password_reset_email", _slow_mail)

    started = time.monotonic()
    r = client.post("/api/auth/password/reset-request", json={"email": email.upper()})
    elapsed = time.monotonic() - started

    assert r.status_code == 200
    # Endpoint must return immediately without blocking on the 1s SMTP send.
    assert elapsed < 0.5, f"reset-request blocked for {elapsed:.2f}s"
    assert called.wait(timeout=2.0), "async reset email worker was not invoked"


# ---------------------------------------------------------------------------
# M-01: Backend HTTP(S) URL scheme allowlist
# ---------------------------------------------------------------------------

def test_m01_backend_http_url_validation_unit_and_api(client, user_factory, warranty_factory):
    # Unit checks
    assert _validate_http_url(None) is None
    assert _validate_http_url("") == ""
    assert _validate_http_url("https://example.com/item?x=1") == "https://example.com/item?x=1"
    assert _validate_http_url("http://localhost:8080/p") == "http://localhost:8080/p"
    assert _validate_http_url("www.example.com/product") == "https://www.example.com/product"

    for bad in (
        "javascript:alert(1)",
        "JAVASCRIPT:alert(1)",
        "java\tscript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "file:///etc/passwd",
        "ftp://files.example.com/a",
        "//evil.example.com/x",
        "https://example.com/\nheader",
    ):
        with pytest.raises(ValueError):
            _validate_http_url(bad)

    # API checks: create, update, and CSV import
    user = user_factory()
    h = user["headers"]

    r_bad_create = warranty_factory(h, product_url="javascript:alert(1)")
    assert r_bad_create.status_code == 400

    r_bad_doc_url = warranty_factory(h, invoice_url="data:text/html,hi")
    assert r_bad_doc_url.status_code == 400

    # Bare domain auto-prefixes https:// so legitimate user habits stay seamless.
    r_bare = warranty_factory(h, product_name="BareUrlWidget", product_url="example.com/dp/123")
    assert r_bare.status_code == 201, r_bare.get_data(as_text=True)
    wid = r_bare.get_json()["id"]
    items = client.get("/api/warranties", headers=h).get_json()
    items_list = items["warranties"] if isinstance(items, dict) else items
    created = next(w for w in items_list if w["id"] == wid)
    assert created["product_url"] == "https://example.com/dp/123"

    r_bad_update = client.put(
        f"/api/warranties/{wid}",
        headers=h,
        data={
            "product_name": "BareUrlWidget",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2027-01-01",
            "other_document_url": "file:///etc/passwd",
        },
    )
    assert r_bad_update.status_code == 400

    csv_body = (
        "ProductName,PurchaseDate,ExpirationDate,ProductURL\n"
        "BadUrlCsv,2025-01-01,2027-01-01,javascript:alert(1)\n"
    ).encode("utf-8")
    r_csv = client.post(
        "/api/warranties/import",
        headers=h,
        data={"csv_file": (io.BytesIO(csv_body), "bad_url.csv")},
        content_type="multipart/form-data",
    )
    assert r_csv.status_code == 400
    assert r_csv.get_json()["failure_count"] == 1
