"""Rate limiting on the auth surface (AUTH-05).

Login: 10 failures for one (client IP, username) pair in 5 minutes,
then 429. A success clears the pair's failures. Reset requests: 5
per email address per hour; a limited request is answered with the
same generic 200 as an unknown address, and no token is minted.
"""
from backend.auth_routes import _hash_reset_token


def _wrong_login(client, username):
    return client.post("/api/auth/login", json={
        "username": username, "password": "WrongPass123!"})


def _token_hash_for(db_connection, email):
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT token FROM password_reset_tokens WHERE user_id = "
            "(SELECT id FROM users WHERE email = %s)", (email,))
        row = cur.fetchone()
        return row[0] if row else None


def test_login_locks_out_after_repeated_failures(client, user_factory):
    user = user_factory()
    for _ in range(10):
        r = _wrong_login(client, user["username"])
        assert r.status_code == 401
    r = _wrong_login(client, user["username"])
    assert r.status_code == 429
    assert "Too many failed login attempts" in r.get_json()["message"]
    # The correct password does not get through while locked out.
    r = client.post("/api/auth/login", json={
        "username": user["username"], "password": "TestPass123!"})
    assert r.status_code == 429


def test_successful_login_clears_failure_count(client, user_factory):
    user = user_factory()
    for _ in range(9):
        assert _wrong_login(client, user["username"]).status_code == 401
    r = client.post("/api/auth/login", json={
        "username": user["username"], "password": "TestPass123!"})
    assert r.status_code == 200
    # The counter cleared on success: one more failure is a plain 401.
    assert _wrong_login(client, user["username"]).status_code == 401


def test_lockout_is_per_username(client, user_factory):
    locked = user_factory()
    other = user_factory()
    for _ in range(11):
        _wrong_login(client, locked["username"])
    assert _wrong_login(client, locked["username"]).status_code == 429
    r = client.post("/api/auth/login", json={
        "username": other["username"], "password": "TestPass123!"})
    assert r.status_code == 200


def test_reset_requests_capped_per_email(
        client, user_factory, db_connection):
    user = user_factory()
    email = f"{user['username']}@test.local"
    for _ in range(5):
        r = client.post("/api/auth/password/reset-request",
                        json={"email": email})
        assert r.status_code == 200
    token_after_five = _token_hash_for(db_connection, email)
    assert token_after_five is not None
    # The sixth request is answered generically and mints nothing.
    r = client.post("/api/auth/password/reset-request",
                    json={"email": email})
    assert r.status_code == 200
    assert r.get_json()["message"] == (
        "If your email is registered, you will receive a "
        "password reset link.")
    assert _token_hash_for(db_connection, email) == token_after_five


def test_reset_limit_does_not_block_other_addresses(
        client, user_factory, db_connection):
    capped = user_factory()
    other = user_factory()
    capped_email = f"{capped['username']}@test.local"
    other_email = f"{other['username']}@test.local"
    for _ in range(6):
        client.post("/api/auth/password/reset-request",
                    json={"email": capped_email})
    assert _token_hash_for(db_connection, capped_email) is not None
    r = client.post("/api/auth/password/reset-request",
                    json={"email": other_email})
    assert r.status_code == 200
    assert _token_hash_for(db_connection, other_email) is not None
