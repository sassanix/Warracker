"""Account enumeration hardening (AUTH-06) and reset token storage (AUTH-08).

AUTH-06: login always runs the bcrypt check, so an unknown user and a
known user with a wrong password take the same time, and an OIDC-only
account with no local password hash gets the same 401 as a wrong
password instead of a 500.

AUTH-08: reset tokens are stored as SHA-256 hashes, so the database
value alone can never complete a reset, and tokens live one hour.
"""
import re
import time
import uuid
from datetime import datetime, timedelta, UTC

from backend.auth_routes import _hash_reset_token


def test_unknown_user_login_is_slow_401(client):
    started = time.monotonic()
    r = client.post("/api/auth/login", json={
        "username": "nobody-at-all", "password": "Whatever123!"})
    elapsed = time.monotonic() - started
    assert r.status_code == 401
    assert r.get_json()["message"] == "Invalid username or password!"
    # The bcrypt check must have run: the pre-fix skip answered in ~3 ms.
    assert elapsed > 0.05


def test_oidc_only_user_login_is_401_not_500(client, db_connection):
    username = f"oidconly_{uuid.uuid4().hex[:8]}"
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO users (username, email, password_hash, oidc_sub, "
            "oidc_issuer, is_active) VALUES (%s, %s, NULL, %s, %s, TRUE)",
            (username, f"{username}@test.local", "sub-123", "https://idp.test"),
        )
    r = client.post("/api/auth/login", json={
        "username": username, "password": "Whatever123!"})
    assert r.status_code == 401
    assert r.get_json()["message"] == "Invalid username or password!"


def test_known_user_wrong_password_still_401(client, user_factory):
    user = user_factory()
    r = client.post("/api/auth/login", json={
        "username": user["username"], "password": "WrongPass123!"})
    assert r.status_code == 401
    assert r.get_json()["message"] == "Invalid username or password!"


def _request_reset(client, db_connection, email):
    r = client.post("/api/auth/password/reset-request", json={"email": email})
    assert r.status_code == 200
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT token, expires_at, created_at FROM password_reset_tokens "
            "WHERE user_id = (SELECT id FROM users WHERE email = %s)",
            (email,),
        )
        return cur.fetchone()


def test_reset_token_stored_as_hash_with_one_hour_life(
        client, user_factory, db_connection):
    user = user_factory()
    email = f"{user['username']}@test.local"
    token, expires_at, created_at = _request_reset(client, db_connection, email)
    # A SHA-256 hex digest, not the raw uuid4 token from the email link.
    assert re.fullmatch(r"[0-9a-f]{64}", token), token
    lifetime = (expires_at - created_at).total_seconds()
    assert 3500 < lifetime <= 3610, lifetime


def test_reset_completes_with_raw_token_not_with_stored_hash(
        client, user_factory, db_connection):
    user = user_factory()
    email = f"{user['username']}@test.local"
    raw_token = str(uuid.uuid4())
    with db_connection, db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) "
            "VALUES (%s, %s, %s)",
            (user_id, _hash_reset_token(raw_token),
             datetime.now(UTC) + timedelta(hours=1)),
        )

    # The stored hash value alone must not complete a reset.
    stored_hash = _hash_reset_token(raw_token)
    r = client.post("/api/auth/password/reset", json={
        "token": stored_hash, "password": "NewPass123!"})
    assert r.status_code == 400

    # The raw token from the email link completes the reset.
    r = client.post("/api/auth/password/reset", json={
        "token": raw_token, "password": "NewPass123!"})
    assert r.status_code == 200

    # The new password works, and the token is single-use.
    r = client.post("/api/auth/login", json={
        "username": user["username"], "password": "NewPass123!"})
    assert r.status_code == 200
    r = client.post("/api/auth/password/reset", json={
        "token": raw_token, "password": "Another123!"})
    assert r.status_code == 400


def test_expired_reset_token_rejected(client, user_factory, db_connection):
    user = user_factory()
    email = f"{user['username']}@test.local"
    raw_token = str(uuid.uuid4())
    with db_connection, db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) "
            "VALUES (%s, %s, %s)",
            (user_id, _hash_reset_token(raw_token),
             datetime.now(UTC) - timedelta(minutes=1)),
        )
    r = client.post("/api/auth/password/reset", json={
        "token": raw_token, "password": "NewPass123!"})
    assert r.status_code == 400
