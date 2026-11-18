"""Email change confirmation (AUTH-09).

Changing the account email needs the current password, so a stolen
session alone cannot convert the account and then take it over with
a reset to the new address. A notice goes to the old address. An
account with no local password (single sign-on) cannot change its
email here; an admin changes it instead.
"""
import uuid
from datetime import datetime, UTC, timedelta

import jwt

from backend.auth_utils import generate_token


def _change_email(client, headers, email, **extra):
    body = {"first_name": "Test", "last_name": "User", "email": email}
    body.update(extra)
    return client.put("/api/auth/profile", headers=headers, json=body)


def test_email_change_requires_current_password(client, user_factory):
    user = user_factory()
    headers = user["headers"]
    new_email = f"moved-{user['username']}@test.local"

    r = _change_email(client, headers, new_email)
    assert r.status_code == 401
    assert r.get_json()["message"] == "Incorrect current password!"

    r = _change_email(client, headers, new_email,
                      current_password="WrongPass123!")
    assert r.status_code == 401

    r = _change_email(client, headers, new_email,
                      current_password="TestPass123!")
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["email"] == new_email


def test_email_change_notifies_old_address(
        client, user_factory, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "backend.auth_routes.send_email_change_notice",
        lambda old, new: calls.append((old, new)) or True)
    user = user_factory()
    headers = user["headers"]
    old_email = f"{user['username']}@test.local"
    new_email = f"moved-{user['username']}@test.local"
    r = _change_email(client, headers, new_email,
                      current_password="TestPass123!")
    assert r.status_code == 200, r.get_data(as_text=True)
    assert calls == [(old_email, new_email)]


def test_name_only_change_needs_no_password_and_sends_no_notice(
        client, user_factory, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "backend.auth_routes.send_email_change_notice",
        lambda old, new: calls.append((old, new)) or True)
    user = user_factory()
    r = client.put("/api/auth/profile", headers=user["headers"], json={
        "first_name": "Renamed", "last_name": "User",
        "email": f"{user['username']}@test.local",
    })
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["first_name"] == "Renamed"
    assert calls == []


def test_oidc_only_account_cannot_change_email(
        app, client, db_connection):
    username = f"oidconly_{uuid.uuid4().hex[:8]}"
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO users (username, email, password_hash, oidc_sub, "
            "oidc_issuer, is_active) VALUES (%s, %s, NULL, %s, %s, TRUE) "
            "RETURNING id",
            (username, f"{username}@test.local",
             f"sub-{uuid.uuid4().hex[:12]}", "https://idp.test"),
        )
        user_id = cur.fetchone()[0]
    with app.app_context():
        token, jti = generate_token(user_id)
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO user_sessions (user_id, session_token, expires_at, "
            "ip_address, user_agent, login_method) VALUES (%s, %s, %s, %s, "
            "%s, %s)",
            (user_id, jti, datetime.now(UTC) + timedelta(hours=24),
             "127.0.0.1", "pytest", "oidc"),
        )
    r = _change_email(client, {"Authorization": f"Bearer {token}"},
                      f"moved-{username}@test.local",
                      current_password="Whatever123!")
    assert r.status_code == 403
    assert "administrator" in r.get_json()["message"]


def test_email_change_notice_sender_returns_false_without_smtp(app):
    """The notice is best effort: with no SMTP server it fails quietly."""
    from backend.auth_routes import send_email_change_notice
    with app.app_context():
        assert send_email_change_notice(
            "old@test.local", "new@test.local") is False


def test_change_email_route_notifies_old_address(
        client, user_factory, monkeypatch):
    """The separate /change-email route already required the password;
    it now notifies the old address too, like the profile flow."""
    calls = []
    monkeypatch.setattr(
        "backend.auth_routes.send_email_change_notice",
        lambda old, new: calls.append((old, new)) or True)
    user = user_factory()
    new_email = f"moved2-{user['username']}@test.local"
    r = client.post("/api/auth/change-email", headers=user["headers"],
                    json={"new_email": new_email,
                          "password": "TestPass123!"})
    assert r.status_code == 200, r.get_data(as_text=True)
    assert calls == [(f"{user['username']}@test.local", new_email)]
