"""User preferences, language settings, registration gate, account deletion,
admin user deletion, and audit trail endpoints.

Covers previously untested account & admin lifecycle flows:
- GET & PUT /api/auth/preferences (defaults, persistence, saved_filters, 400 checks)
- PUT /api/auth/user/language-preference
- GET /api/auth/registration-status and POST /api/auth/register enforcement
- DELETE /api/auth/account (cleanup + immediate token revocation; owner protection)
- DELETE /api/admin/users/<id> (self/owner protection, cleanup, audit log)
- GET /api/admin/audit-trail (admin-only enforcement + recorded actions)
"""
import pytest


def _promote(db_connection, username):
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "UPDATE users SET is_admin = TRUE WHERE username = %s",
            (username,),
        )


def _user_id(client, headers):
    me = client.get("/api/auth/user", headers=headers).get_json()
    return me["user"]["id"] if "user" in me else me["id"]


def test_user_preferences_get_put_and_validation(client, user_factory):
    user = user_factory()
    h = user["headers"]

    # Default preferences for a new user.
    r_get = client.get("/api/auth/preferences", headers=h)
    assert r_get.status_code == 200, r_get.get_data(as_text=True)
    defaults = r_get.get_json()
    assert defaults["default_view"] == "grid"
    assert defaults["theme"] == "light"
    assert defaults["expiring_soon_days"] == 30
    assert defaults["currency_position"] == "left"
    assert defaults["preferred_language"] == "en"

    # Invalid values are rejected with 400.
    bad_payloads = [
        {"default_view": "kanban"},
        {"theme": "neon"},
        {"expiring_soon_days": 0},
        {"expiring_soon_days": 366},
        {"expiring_soon_days": "not-a-number"},
        {"currency_symbol": "123456789"},
        {"currency_position": "center"},
        {"date_format": "BAD_FMT"},
        {"notification_channel": "carrier_pigeon"},
        {"paperless_view_in_app": "yes"},
        {"preferred_language": "xx_INVALID"},
    ]
    for payload in bad_payloads:
        r_bad = client.put("/api/auth/preferences", headers=h, json=payload)
        assert r_bad.status_code == 400, f"expected 400 for {payload}, got {r_bad.status_code}"

    # First PUT (creates row if absent) + second PUT (updates row + saved_filters).
    r_put1 = client.put(
        "/api/auth/preferences",
        headers=h,
        json={
            "default_view": "table",
            "theme": "dark",
            "expiring_soon_days": 14,
            "currency_symbol": "€",
            "currency_position": "right",
            "date_format": "DMY",
            "notification_channel": "both",
            "timezone": "Europe/Berlin",
            "paperless_view_in_app": True,
            "preferred_language": "de",
        },
    )
    assert r_put1.status_code == 200, r_put1.get_data(as_text=True)
    saved = r_put1.get_json()
    assert saved["default_view"] == "table"
    assert saved["theme"] == "dark"
    assert saved["expiring_soon_days"] == 14
    assert saved["currency_symbol"] == "€"
    assert saved["currency_position"] == "right"
    assert saved["date_format"] == "DMY"
    assert saved["notification_channel"] == "both"
    assert saved["timezone"] == "Europe/Berlin"
    assert saved["paperless_view_in_app"] is True
    assert saved["preferred_language"] == "de"

    r_put2 = client.put(
        "/api/auth/preferences",
        headers=h,
        json={"saved_filters": {"status": "active", "sort": "expiration"}},
    )
    assert r_put2.status_code == 200, r_put2.get_data(as_text=True)
    assert r_put2.get_json()["saved_filters"] == {
        "status": "active",
        "sort": "expiration",
    }

    # GET reflects persisted updates.
    r_after = client.get("/api/auth/preferences", headers=h)
    assert r_after.status_code == 200
    after = r_after.get_json()
    assert after["theme"] == "dark"
    assert after["preferred_language"] == "de"
    assert after["saved_filters"] == {"status": "active", "sort": "expiration"}


def test_language_preference_endpoint(client, user_factory):
    user = user_factory()
    h = user["headers"]

    assert client.put(
        "/api/auth/user/language-preference", headers=h, json={}
    ).status_code == 400
    assert client.put(
        "/api/auth/user/language-preference",
        headers=h,
        json={"preferred_language": "klingon"},
    ).status_code == 400

    r_ok = client.put(
        "/api/auth/user/language-preference",
        headers=h,
        json={"preferred_language": "he"},
    )
    assert r_ok.status_code == 200, r_ok.get_data(as_text=True)

    prefs = client.get("/api/auth/preferences", headers=h).get_json()
    assert prefs["preferred_language"] == "he"


def test_registration_status_and_disabled_registration(client, db_connection):
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT value FROM site_settings WHERE key = 'registration_enabled'"
        )
        row = cur.fetchone()
        prev = row[0] if row else None

    try:
        # Disable registration.
        with db_connection, db_connection.cursor() as cur:
            cur.execute(
                "INSERT INTO site_settings (key, value) VALUES ('registration_enabled', 'false') "
                "ON CONFLICT (key) DO UPDATE SET value = 'false'"
            )

        r_status = client.get("/api/auth/registration-status")
        assert r_status.status_code == 200
        assert r_status.get_json()["enabled"] is False

        r_reg = client.post(
            "/api/auth/register",
            json={
                "username": "blocked_reg_user",
                "email": "blocked_reg@test.local",
                "password": "TestPass123!",
            },
        )
        assert r_reg.status_code == 403

        # Re-enable registration.
        with db_connection, db_connection.cursor() as cur:
            cur.execute(
                "UPDATE site_settings SET value = 'true' WHERE key = 'registration_enabled'"
            )
        assert client.get("/api/auth/registration-status").get_json()["enabled"] is True
    finally:
        with db_connection, db_connection.cursor() as cur:
            if prev is None:
                cur.execute(
                    "DELETE FROM site_settings WHERE key = 'registration_enabled'"
                )
            else:
                cur.execute(
                    "UPDATE site_settings SET value = %s WHERE key = 'registration_enabled'",
                    (prev,),
                )


def test_self_account_deletion_cleans_data_and_blocks_owner(
        client, admin_user, user_factory, warranty_factory, db_connection):
    # Ensure at least one owner exists (first registered user / admin_user).
    with db_connection, db_connection.cursor() as cur:
        cur.execute("SELECT id, username FROM users WHERE is_owner = TRUE LIMIT 1")
        owner_row = cur.fetchone()
        if not owner_row:
            cur.execute(
                "UPDATE users SET is_owner = TRUE, is_admin = TRUE WHERE username = %s",
                (admin_user["username"],),
            )

    # Regular user creates warranty, tag, and preference, then deletes account.
    victim = user_factory()
    h = victim["headers"]
    uid = _user_id(client, h)
    wid = warranty_factory(h, product_name="Doomed Item").get_json()["id"]
    tid = client.post(
        "/api/tags", headers=h, json={"name": "DoomedTag", "color": "#222222"}
    ).get_json()["id"]
    assert client.put(
        "/api/auth/preferences", headers=h, json={"theme": "dark"}
    ).status_code == 200

    r_del = client.delete("/api/auth/account", headers=h)
    assert r_del.status_code == 200, r_del.get_data(as_text=True)

    # Old token is immediately rejected, and DB rows are gone.
    assert client.get("/api/warranties", headers=h).status_code == 401
    with db_connection.cursor() as cur:
        cur.execute("SELECT 1 FROM users WHERE id = %s", (uid,))
        assert cur.fetchone() is None
        cur.execute("SELECT 1 FROM warranties WHERE id = %s", (wid,))
        assert cur.fetchone() is None
        cur.execute("SELECT 1 FROM tags WHERE id = %s", (tid,))
        assert cur.fetchone() is None

    # Owner cannot delete their own account.
    if owner_row is None or owner_row[1] == admin_user["username"]:
        r_owner_del = client.delete("/api/auth/account", headers=admin_user["headers"])
        assert r_owner_del.status_code == 403


def test_admin_delete_user_protections_and_audit_trail(
        client, admin_user, user_factory, warranty_factory, db_connection):
    _promote(db_connection, admin_user["username"])
    admin_id = _user_id(client, admin_user["headers"])

    # Make sure an owner exists in the DB (mark admin_user if none).
    with db_connection, db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE is_owner = TRUE LIMIT 1")
        row = cur.fetchone()
        if row:
            owner_id = row[0]
        else:
            cur.execute("UPDATE users SET is_owner = TRUE WHERE id = %s", (admin_id,))
            owner_id = admin_id

    regular = user_factory()
    reg_id = _user_id(client, regular["headers"])
    wid = warranty_factory(regular["headers"], product_name="Admin Deleted Item").get_json()["id"]

    # Non-admin blocked from audit trail and user deletion.
    assert client.get("/api/admin/audit-trail", headers=regular["headers"]).status_code == 403
    assert client.delete(
        f"/api/admin/users/{admin_id}", headers=regular["headers"]
    ).status_code == 403

    # Admin cannot delete self (403), cannot delete nonexistent user (404),
    # and cannot delete owner (403) even from a second admin account.
    assert client.delete(
        f"/api/admin/users/{admin_id}", headers=admin_user["headers"]
    ).status_code == 403
    assert client.delete(
        "/api/admin/users/99999999", headers=admin_user["headers"]
    ).status_code == 404

    second_admin = user_factory()
    _promote(db_connection, second_admin["username"])
    assert client.delete(
        f"/api/admin/users/{owner_id}", headers=second_admin["headers"]
    ).status_code == 403

    # Deleting a regular user succeeds, cleans up their data, and logs to audit trail.
    r_del = client.delete(
        f"/api/admin/users/{reg_id}", headers=admin_user["headers"]
    )
    assert r_del.status_code == 200, r_del.get_data(as_text=True)

    with db_connection.cursor() as cur:
        cur.execute("SELECT 1 FROM users WHERE id = %s", (reg_id,))
        assert cur.fetchone() is None
        cur.execute("SELECT 1 FROM warranties WHERE id = %s", (wid,))
        assert cur.fetchone() is None

    r_audit = client.get("/api/admin/audit-trail?limit=20", headers=admin_user["headers"])
    assert r_audit.status_code == 200, r_audit.get_data(as_text=True)
    entries = r_audit.get_json()
    assert any(
        e["action"] == "DELETE_USER" and e["target_id"] == str(reg_id)
        for e in entries
    )
