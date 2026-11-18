"""Token revocation (AUTH-01).

Every issued JWT carries a jti bound to its user_sessions row, and
token_required refuses a token whose session row is gone. Logout,
password change, and password reset all delete session rows, so a
captured token stops working after each. Tokens minted before jti
existed carry no jti and are grandfathered until their 24h expiry.
"""
import os
import uuid
from datetime import datetime, timedelta, UTC

import jwt

from backend.auth_routes import _hash_reset_token

# The app signs with the SECRET_KEY from the environment (conftest sets
# the local default; CI sets its own), so forged tokens must use the
# same value or signature verification fails before the jti logic runs.
SECRET_KEY = os.environ.get(
    "SECRET_KEY", "warracker-test-secret-key-0123456789")


def _user_id_from_token(token):
    return jwt.decode(token, options={"verify_signature": False})["sub"]


def _login(client, username, password):
    r = client.post("/api/auth/login", json={
        "username": username, "password": password})
    assert r.status_code == 200, r.get_data(as_text=True)
    return r.get_json()["token"]


def test_logout_revokes_token(client, user_factory):
    user = user_factory()
    token = _login(client, user["username"], "TestPass123!")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/user", headers=headers).status_code == 200
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    r = client.get("/api/auth/user", headers=headers)
    assert r.status_code == 401
    assert r.get_json()["message"] == "Session expired or revoked!"


def test_password_change_revokes_other_sessions_only(client, user_factory):
    user = user_factory()
    token_a = _login(client, user["username"], "TestPass123!")
    token_b = _login(client, user["username"], "TestPass123!")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    assert client.get("/api/auth/user", headers=headers_b).status_code == 200

    r = client.post("/api/auth/password/change", headers=headers_a, json={
        "current_password": "TestPass123!",
        "new_password": "ChangedPass123!",
    })
    assert r.status_code == 200, r.get_data(as_text=True)

    # The session that changed the password keeps working; the other one
    # is revoked, so a token captured before the change stops working.
    assert client.get("/api/auth/user", headers=headers_a).status_code == 200
    r = client.get("/api/auth/user", headers=headers_b)
    assert r.status_code == 401
    assert r.get_json()["message"] == "Session expired or revoked!"

    # The new password works for a fresh login.
    assert _login(client, user["username"], "ChangedPass123!")


def test_password_reset_revokes_all_sessions(
        client, user_factory, db_connection):
    user = user_factory()
    token = _login(client, user["username"], "TestPass123!")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/user", headers=headers).status_code == 200

    raw_token = str(uuid.uuid4())
    with db_connection, db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s",
                    (user["username"],))
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) "
            "VALUES (%s, %s, %s)",
            (user_id, _hash_reset_token(raw_token),
             datetime.now(UTC) + timedelta(hours=1)),
        )
    r = client.post("/api/auth/password/reset", json={
        "token": raw_token, "password": "ResetPass123!"})
    assert r.status_code == 200, r.get_data(as_text=True)

    r = client.get("/api/auth/user", headers=headers)
    assert r.status_code == 401
    assert r.get_json()["message"] == "Session expired or revoked!"
    assert _login(client, user["username"], "ResetPass123!")


def test_token_with_unknown_jti_is_rejected(client, user_factory):
    user = user_factory()
    token = _login(client, user["username"], "TestPass123!")
    user_id = _user_id_from_token(token)
    forged = jwt.encode({
        "exp": datetime.now(UTC) + timedelta(hours=24),
        "iat": datetime.now(UTC),
        "sub": str(user_id),
        "jti": str(uuid.uuid4()),
    }, SECRET_KEY, algorithm="HS256")
    r = client.get("/api/auth/user",
                   headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401
    assert r.get_json()["message"] == "Session expired or revoked!"


def test_legacy_token_without_jti_is_grandfathered(client, user_factory):
    user = user_factory()
    token = _login(client, user["username"], "TestPass123!")
    user_id = _user_id_from_token(token)
    legacy = jwt.encode({
        "exp": datetime.now(UTC) + timedelta(hours=24),
        "iat": datetime.now(UTC),
        "sub": str(user_id),
    }, SECRET_KEY, algorithm="HS256")
    r = client.get("/api/auth/user",
                   headers={"Authorization": f"Bearer {legacy}"})
    assert r.status_code == 200, r.get_data(as_text=True)
