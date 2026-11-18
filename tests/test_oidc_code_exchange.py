"""AUTH-03: the OIDC login delivers a single-use code, not a JWT.

The SSO callback used to redirect to auth-redirect.html?token=<full
24h JWT>, which persisted in browser history. It now stores a
short-lived single-use code (only the hash is stored) and redirects
with ?code=; the frontend exchanges the code for the JWT over POST.
"""
import hashlib
import uuid
from datetime import datetime, UTC, timedelta
from urllib.parse import parse_qs, urlparse

import pytest

from backend import oidc_handler
from backend.auth_utils import decode_token_payload

CODE = "test-login-code-" + uuid.uuid4().hex


def _code_hash(code):
    return hashlib.sha256(code.encode()).hexdigest()


def _insert_code(db_connection, user_id, code, expires_in=300, is_new_user=False):
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO oidc_login_codes (code_hash, user_id, is_new_user, expires_at) "
            "VALUES (%s, %s, %s, %s)",
            (_code_hash(code), user_id,
             is_new_user, datetime.now(UTC) + timedelta(seconds=expires_in)),
        )


def _user_id(db_connection, username):
    with db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()[0]


def _exchange(client, code):
    return client.post("/api/auth/oidc-exchange", json={"code": code})


def test_exchange_mints_token_and_session(client, app, user_factory, db_connection):
    user = user_factory()
    uid = _user_id(db_connection, user["username"])
    code = "mint-" + uuid.uuid4().hex
    _insert_code(db_connection, uid, code)
    r = _exchange(client, code)
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    assert body["new_user"] is False
    token = body["token"]
    assert token

    # The token is a real JWT bound to a live session row (AUTH-01).
    with app.app_context():
        payload = decode_token_payload(token)
    assert payload["sub"] == str(uid)
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM user_sessions "
            "WHERE user_id = %s AND session_token = %s",
            (uid, payload["jti"]))
        assert cur.fetchone()[0] == 1
        cur.execute(
            "SELECT COUNT(*) FROM oidc_login_codes WHERE code_hash = %s",
            (_code_hash(code),))
        assert cur.fetchone()[0] == 0

    # And it validates through the normal endpoint.
    r = client.get("/api/auth/validate-token",
                   headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.get_json()["valid"] is True


def test_exchange_is_single_use(client, user_factory, db_connection):
    user = user_factory()
    uid = _user_id(db_connection, user["username"])
    code = "once-" + uuid.uuid4().hex
    _insert_code(db_connection, uid, code)
    assert _exchange(client, code).status_code == 200
    r = _exchange(client, code)
    assert r.status_code == 400
    assert "Invalid or expired" in r.get_json()["error"]


def test_exchange_rejects_unknown_and_expired_codes(
        client, user_factory, db_connection):
    user = user_factory()
    uid = _user_id(db_connection, user["username"])
    r = _exchange(client, "never-issued-" + uuid.uuid4().hex)
    assert r.status_code == 400
    assert "Invalid or expired" in r.get_json()["error"]

    expired = "expired-" + uuid.uuid4().hex
    _insert_code(db_connection, uid, expired, expires_in=-60)
    r = _exchange(client, expired)
    assert r.status_code == 400
    assert "Invalid or expired" in r.get_json()["error"]

    r = client.post("/api/auth/oidc-exchange", json={})
    assert r.status_code == 400


# --- The callback redirects with a code, never a token ---

class _FakeOIDCClient:
    def __init__(self, sub, email):
        self._sub = sub
        self._email = email

    def authorize_access_token(self):
        return {"userinfo": {
            "sub": self._sub, "iss": "https://idp.example.com",
            "email": self._email, "given_name": "Oidc", "family_name": "Code",
        }}

    def userinfo(self, token=None):
        return {"sub": self._sub, "email": self._email}


def test_callback_redirects_with_code_not_token(
        client, app, monkeypatch, db_connection):
    sub = "sub-" + uuid.uuid4().hex
    email = f"oidc-code-{uuid.uuid4().hex[:8]}@example.com"
    monkeypatch.setattr(
        oidc_handler.oauth, "create_client",
        lambda name: _FakeOIDCClient(sub, email))
    app.config["OIDC_ENABLED"] = True
    app.config["OIDC_PROVIDER_NAME"] = "testidp"
    try:
        r = client.get("/api/oidc/callback")
    finally:
        app.config["OIDC_ENABLED"] = False
        app.config.pop("OIDC_PROVIDER_NAME", None)
    assert r.status_code == 302, r.get_data(as_text=True)
    location = r.headers["Location"]
    query = parse_qs(urlparse(location).query)
    assert "token" not in query
    assert "code" in query
    assert query["new_user"] == ["true"]

    # The code redeems through the exchange endpoint.
    code = query["code"][0]
    r = _exchange(client, code)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["new_user"] is True
    with db_connection.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM users WHERE oidc_sub = %s", (sub,))
        assert cur.fetchone()[0] == 1
