"""OIDC-only mode enforcement (AUTH-12, maintainer ruling D1).

With oidc_only_mode on, local sign-in and local registration are
refused outright, and a password reset never mints a local password
for an OIDC-managed account (neither at request time nor at
completion, so a token minted before the mode was turned on cannot
complete either). Local accounts can still request a reset while the
mode is on; the password is usable again if the mode is later turned
off. The mode itself is the escape hatch: an OIDC admin can turn it
off, or it can be cleared with OIDC_ONLY_MODE=false.
"""
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, UTC

from backend.auth_routes import _hash_reset_token


@contextmanager
def only_mode(db_connection, enabled=True):
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO site_settings (key, value) VALUES "
            "('oidc_only_mode', %s) ON CONFLICT (key) DO UPDATE "
            "SET value = EXCLUDED.value",
            ("true" if enabled else "false",),
        )
    try:
        yield
    finally:
        with db_connection, db_connection.cursor() as cur:
            cur.execute(
                "DELETE FROM site_settings WHERE key = 'oidc_only_mode'")


def _oidc_only_user(db_connection):
    username = f"oidconly_{uuid.uuid4().hex[:8]}"
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO users (username, email, password_hash, oidc_sub, "
            "oidc_issuer, is_active) VALUES (%s, %s, NULL, %s, %s, TRUE) "
            "RETURNING id",
            (username, f"{username}@test.local",
             f"sub-{uuid.uuid4().hex[:12]}", "https://idp.test"),
        )
        return username, f"{username}@test.local", cur.fetchone()[0]


def _reset_tokens_for(db_connection, user_id):
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM password_reset_tokens WHERE user_id = %s",
            (user_id,),
        )
        return cur.fetchone()[0]


def test_local_login_refused_when_only_mode(
        client, user_factory, db_connection):
    user = user_factory()
    with only_mode(db_connection):
        r = client.post("/api/auth/login", json={
            "username": user["username"], "password": "TestPass123!"})
        assert r.status_code == 403
        assert "single sign-on" in r.get_json()["message"]
    # The mode off again, the same credentials work.
    r = client.post("/api/auth/login", json={
        "username": user["username"], "password": "TestPass123!"})
    assert r.status_code == 200


def test_local_registration_refused_when_only_mode(client, db_connection):
    with only_mode(db_connection):
        r = client.post("/api/auth/register", json={
            "username": f"local_{uuid.uuid4().hex[:8]}",
            "email": "local@test.local",
            "password": "TestPass123!",
        })
        assert r.status_code == 403
        assert "single sign-on" in r.get_json()["message"]


def test_reset_mints_nothing_for_oidc_account_when_only_mode(
        client, db_connection):
    _, email, user_id = _oidc_only_user(db_connection)
    with only_mode(db_connection):
        r = client.post("/api/auth/password/reset-request",
                        json={"email": email})
        # Same generic message as for an unknown address.
        assert r.status_code == 200
        assert r.get_json()["message"] == (
            "If your email is registered, you will receive a "
            "password reset link.")
        assert _reset_tokens_for(db_connection, user_id) == 0


def test_reset_still_mints_for_local_account_when_only_mode(
        client, user_factory, db_connection):
    user = user_factory()
    email = f"{user['username']}@test.local"
    with only_mode(db_connection):
        r = client.post("/api/auth/password/reset-request",
                        json={"email": email})
        assert r.status_code == 200
        with db_connection.cursor() as cur:
            cur.execute(
                "SELECT id FROM users WHERE email = %s", (email,))
            user_id = cur.fetchone()[0]
        assert _reset_tokens_for(db_connection, user_id) == 1


def test_reset_completion_refused_for_oidc_account_when_only_mode(
        client, db_connection):
    _, _, user_id = _oidc_only_user(db_connection)
    raw_token = str(uuid.uuid4())
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) "
            "VALUES (%s, %s, %s)",
            (user_id, _hash_reset_token(raw_token),
             datetime.now(UTC) + timedelta(hours=1)),
        )
    with only_mode(db_connection):
        r = client.post("/api/auth/password/reset", json={
            "token": raw_token, "password": "NewPass123!"})
        assert r.status_code == 400
        assert r.get_json()["message"] == "Invalid or expired token!"
    # The token is still valid once the mode is off.
    r = client.post("/api/auth/password/reset", json={
        "token": raw_token, "password": "NewPass123!"})
    assert r.status_code == 200
