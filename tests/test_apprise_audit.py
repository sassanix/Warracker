"""ADM-03: the Apprise test and send-custom endpoints must write audit
entries. Per-request URLs embed credentials, so the entries record
only schemes and counts, never hosts, paths, or notification content.
"""
import types

import pytest

import backend.admin_routes as admin_routes


@pytest.fixture()
def stub_handler(monkeypatch):
    calls = {"test": [], "custom": []}
    stub = types.SimpleNamespace(
        send_test_notification=lambda url=None: (
            calls["test"].append(url), True)[1],
        send_custom_notification=lambda title, message, urls=None: (
            calls["custom"].append((title, message, urls)), True)[1],
    )
    monkeypatch.setattr(admin_routes, "APPRISE_AVAILABLE", True)
    monkeypatch.setattr(admin_routes, "apprise_handler", stub)
    return calls


def _promote(db_connection, username):
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE users SET is_admin = TRUE WHERE username = %s",
                    (username,))


def _new_audit_rows(db_connection, action, before_id):
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT action, username, target_type, target_id, details "
            "FROM audit_log WHERE action = %s AND id > %s ORDER BY id",
            (action, before_id))
        return cur.fetchall()


def _max_audit_id(db_connection):
    with db_connection.cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(id), 0) FROM audit_log")
        return cur.fetchone()[0]


def test_test_endpoint_audits_per_request_url(
        client, admin_user, db_connection, stub_handler):
    _promote(db_connection, admin_user["username"])
    before = _max_audit_id(db_connection)
    r = client.post("/api/admin/apprise/test", headers=admin_user["headers"],
                    json={"test_url": "tgram://SECRETTOKEN/12345"})
    assert r.status_code == 200, r.get_data(as_text=True)
    assert stub_handler["test"] == ["tgram://SECRETTOKEN/12345"]
    rows = _new_audit_rows(db_connection, "APPRISE_TEST", before)
    assert len(rows) == 1
    _, username, target_type, target_id, details = rows[0]
    assert username == admin_user["username"]
    assert target_type == "Apprise"
    assert "1 per-request URL (schemes: tgram)" in details
    assert "sent" in details
    assert "SECRETTOKEN" not in details
    assert "12345" not in details


def test_test_endpoint_audits_configured_urls(
        client, admin_user, db_connection, stub_handler):
    _promote(db_connection, admin_user["username"])
    before = _max_audit_id(db_connection)
    r = client.post("/api/admin/apprise/test", headers=admin_user["headers"], json={})
    assert r.status_code == 200
    rows = _new_audit_rows(db_connection, "APPRISE_TEST", before)
    assert len(rows) == 1
    assert "configured URLs" in rows[0][4]


def test_test_endpoint_audits_failure(
        client, admin_user, db_connection, monkeypatch):
    _promote(db_connection, admin_user["username"])
    stub = types.SimpleNamespace(send_test_notification=lambda url=None: False)
    monkeypatch.setattr(admin_routes, "APPRISE_AVAILABLE", True)
    monkeypatch.setattr(admin_routes, "apprise_handler", stub)
    before = _max_audit_id(db_connection)
    r = client.post("/api/admin/apprise/test", headers=admin_user["headers"],
                    json={"test_url": "json://127.0.0.1:8931/hook"})
    assert r.status_code == 400
    rows = _new_audit_rows(db_connection, "APPRISE_TEST", before)
    assert len(rows) == 1
    assert "failed" in rows[0][4]
    assert "127.0.0.1" not in rows[0][4]
    assert "8931" not in rows[0][4]


def test_send_custom_audits_schemes_not_credentials(
        client, admin_user, db_connection, stub_handler):
    _promote(db_connection, admin_user["username"])
    before = _max_audit_id(db_connection)
    urls = ["discord://WEBHOOKID/WEBHOOKTOKEN", "json://user:pass@internal.local/x"]
    r = client.post("/api/admin/apprise/send-custom", headers=admin_user["headers"],
                    json={"title": "Hi", "message": "Body",
                          "urls": urls})
    assert r.status_code == 200, r.get_data(as_text=True)
    assert stub_handler["custom"] == [("Hi", "Body", urls)]
    rows = _new_audit_rows(db_connection, "APPRISE_SEND_CUSTOM", before)
    assert len(rows) == 1
    details = rows[0][4]
    assert "2 per-request URLs (schemes: discord, json)" in details
    for secret in ("WEBHOOKID", "WEBHOOKTOKEN", "user", "pass", "internal.local"):
        assert secret not in details
    assert "Hi" not in details and "Body" not in details


def test_send_custom_without_urls_audits_configured(
        client, admin_user, db_connection, stub_handler):
    _promote(db_connection, admin_user["username"])
    before = _max_audit_id(db_connection)
    r = client.post("/api/admin/apprise/send-custom", headers=admin_user["headers"],
                    json={"title": "Hi", "message": "Body"})
    assert r.status_code == 200
    rows = _new_audit_rows(db_connection, "APPRISE_SEND_CUSTOM", before)
    assert len(rows) == 1
    assert "configured URLs" in rows[0][4]


def test_send_custom_validation_failure_writes_no_audit(
        client, admin_user, db_connection, stub_handler):
    _promote(db_connection, admin_user["username"])
    before = _max_audit_id(db_connection)
    r = client.post("/api/admin/apprise/send-custom", headers=admin_user["headers"],
                    json={"message": "no title"})
    assert r.status_code == 400
    assert _new_audit_rows(db_connection, "APPRISE_SEND_CUSTOM", before) == []


def test_non_admin_gets_no_audit_row(
        client, user_factory, db_connection, stub_handler):
    user = user_factory()
    before = _max_audit_id(db_connection)
    r = client.post("/api/admin/apprise/test", headers=user["headers"], json={})
    assert r.status_code == 403
    assert _new_audit_rows(db_connection, "APPRISE_TEST", before) == []
