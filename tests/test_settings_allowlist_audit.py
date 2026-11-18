"""D3 residuals: the settings endpoint allow-list, Apprise audit
masking, and the ownership-transfer audit entry.
"""
import pytest

from backend.admin_routes import SITE_SETTING_KEYS, _setting_value_for_audit


def _promote(db_connection, username, owner=False):
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "UPDATE users SET is_admin = TRUE, is_owner = %s "
            "WHERE username = %s", (owner, username))


def _max_audit_id(db_connection):
    with db_connection.cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(id), 0) FROM audit_log")
        return cur.fetchone()[0]


def _new_audit_rows(db_connection, action, before_id):
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT target_type, target_id, details FROM audit_log "
            "WHERE action = %s AND id > %s ORDER BY id",
            (action, before_id))
        return cur.fetchall()


def _setting_value(db_connection, key):
    with db_connection.cursor() as cur:
        cur.execute("SELECT value FROM site_settings WHERE key = %s", (key,))
        row = cur.fetchone()
        return row[0] if row else None


@pytest.fixture()
def restore_settings(db_connection):
    """Restore the touched settings rows after the test."""
    keys = ["email_base_url", "apprise_urls"]
    before = {key: _setting_value(db_connection, key) for key in keys}
    yield
    with db_connection, db_connection.cursor() as cur:
        for key, value in before.items():
            if value is None:
                cur.execute(
                    "DELETE FROM site_settings WHERE key = %s", (key,))
            else:
                cur.execute(
                    "INSERT INTO site_settings (key, value) VALUES (%s, %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                    (key, value))


def test_allow_list_covers_every_known_key():
    for key in (
        "registration_enabled",
        "email_base_url",
        "global_view_enabled",
        "global_view_admin_only",
        "oidc_enabled",
        "oidc_only_mode",
        "oidc_skip_login_screen",
        "oidc_provider_name",
        "oidc_client_id",
        "oidc_client_secret",
        "oidc_issuer_url",
        "oidc_scope",
        "oidc_admin_group",
        "admin_oidc_group",
        "apprise_enabled",
        "apprise_urls",
        "apprise_expiration_days",
        "apprise_notification_time",
        "apprise_notification_mode",
        "apprise_warranty_scope",
        "apprise_title_prefix",
        "paperless_enabled",
        "paperless_url",
        "paperless_api_token",
    ):
        assert key in SITE_SETTING_KEYS
    assert "junk_key" not in SITE_SETTING_KEYS


def test_unknown_keys_ignored_and_reported(
        client, admin_user, db_connection, restore_settings):
    _promote(db_connection, admin_user["username"])
    before = _max_audit_id(db_connection)
    r = client.put(
        "/api/admin/settings", headers=admin_user["headers"], json={
            "email_base_url": "https://warracker.example",
            "junk_key": "persist-me",
            "another_junk": "1",
        })
    assert r.status_code == 200, r.get_data(as_text=True)
    assert sorted(r.get_json()["ignored_keys"]) == [
        "another_junk", "junk_key"]
    assert _setting_value(db_connection, "email_base_url") == \
        "https://warracker.example"
    assert _setting_value(db_connection, "junk_key") is None
    assert _setting_value(db_connection, "another_junk") is None
    rows = _new_audit_rows(db_connection, "UPDATE_SETTING", before)
    assert [row[1] for row in rows] == ["email_base_url"]


def test_known_keys_save_without_ignored_keys_field(
        client, admin_user, db_connection, restore_settings):
    _promote(db_connection, admin_user["username"])
    r = client.put(
        "/api/admin/settings", headers=admin_user["headers"], json={
            "email_base_url": "https://warracker.example"})
    assert r.status_code == 200
    assert "ignored_keys" not in r.get_json()


def test_audit_masking_covers_apprise_urls_and_secrets():
    assert _setting_value_for_audit(
        "apprise_urls", "tgram://SECRETTOKEN/12345") == "********"
    assert _setting_value_for_audit(
        "oidc_client_secret", "shh") == "********"
    assert _setting_value_for_audit(
        "paperless_api_token", "tok") == "********"
    assert _setting_value_for_audit(
        "smtp_password", "pw") == "********"
    assert _setting_value_for_audit(
        "email_base_url", "https://warracker.example") == \
        "https://warracker.example"


def test_apprise_urls_masked_in_audit_entry(
        client, admin_user, db_connection, restore_settings):
    _promote(db_connection, admin_user["username"])
    before = _max_audit_id(db_connection)
    r = client.put(
        "/api/admin/settings", headers=admin_user["headers"], json={
            "apprise_urls": "tgram://SECRETTOKEN/12345"})
    assert r.status_code == 200, r.get_data(as_text=True)
    rows = _new_audit_rows(db_connection, "UPDATE_SETTING", before)
    assert len(rows) == 1
    assert rows[0][1] == "apprise_urls"
    assert "SECRETTOKEN" not in rows[0][2]
    assert "********" in rows[0][2]


def _user_id(db_connection, username):
    with db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()[0]


def test_ownership_transfer_writes_audit_entry(
        client, user_factory, db_connection):
    current_owner = user_factory()
    new_owner = user_factory()
    _promote(db_connection, current_owner["username"], owner=True)
    _promote(db_connection, new_owner["username"])
    current_id = _user_id(db_connection, current_owner["username"])
    new_id = _user_id(db_connection, new_owner["username"])

    before = _max_audit_id(db_connection)
    r = client.post(
        "/api/admin/transfer-ownership",
        headers=current_owner["headers"], json={"new_owner_id": new_id})
    assert r.status_code == 200, r.get_data(as_text=True)

    rows = _new_audit_rows(db_connection, "TRANSFER_OWNERSHIP", before)
    assert len(rows) == 1
    target_type, target_id, details = rows[0]
    assert target_type == "User"
    assert target_id == str(new_id)
    assert str(current_id) in details and str(new_id) in details

    with db_connection.cursor() as cur:
        cur.execute("SELECT is_owner FROM users WHERE id = %s", (new_id,))
        assert cur.fetchone()[0] is True
        cur.execute("SELECT is_owner FROM users WHERE id = %s", (current_id,))
        assert cur.fetchone()[0] is False

    # Transfer back so later tests still see an owner in place.
    r = client.post(
        "/api/admin/transfer-ownership",
        headers=new_owner["headers"], json={"new_owner_id": current_id})
    assert r.status_code == 200, r.get_data(as_text=True)
