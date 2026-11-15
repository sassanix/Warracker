"""Global view handling on GET /api/debug/warranty/<id> (status page detail).

With global view on, a plain user expanding another user's row on the
status page must get the detail payload, matching the list endpoint.
With global view off, or restricted to admins, non-owners stay 404.
Owners and admins are unaffected by the global view settings.
"""
from types import SimpleNamespace

import pytest


@pytest.fixture()
def _global_view(db_connection):
    """Set the two global view settings, restoring prior values after."""
    conn = db_connection
    with conn.cursor() as cur:
        cur.execute(
            "SELECT key, value FROM site_settings "
            "WHERE key IN ('global_view_enabled', 'global_view_admin_only')"
        )
        saved = dict(cur.fetchall())

    def _set(enabled, admin_only):
        with conn.cursor() as cur:
            for key, value in (
                ("global_view_enabled", enabled),
                ("global_view_admin_only", admin_only),
            ):
                cur.execute(
                    "INSERT INTO site_settings (key, value) VALUES (%s, %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                    (key, value),
                )
        conn.commit()

    yield _set

    with conn.cursor() as cur:
        for key in ("global_view_enabled", "global_view_admin_only"):
            if key in saved:
                cur.execute(
                    "UPDATE site_settings SET value = %s WHERE key = %s",
                    (saved[key], key),
                )
            else:
                cur.execute("DELETE FROM site_settings WHERE key = %s", (key,))
    conn.commit()


@pytest.fixture(scope="module")
def scenario(client, admin_user, user_factory, warranty_factory):
    owner = user_factory()
    other = user_factory()
    r = warranty_factory(owner["headers"], product_name="DebugViewWidget")
    assert r.status_code == 201, r.get_data(as_text=True)
    return SimpleNamespace(
        admin=admin_user["headers"],
        owner=owner["headers"],
        other=other["headers"],
        wid=r.get_json()["id"],
    )


def test_non_owner_global_view_on(client, scenario, _global_view):
    _global_view("true", "false")
    r = client.get(f"/api/debug/warranty/{scenario.wid}", headers=scenario.other)
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    assert body["product_name"] == "DebugViewWidget"
    assert "serial_numbers" in body and "tags" in body


def test_non_owner_global_view_off(client, scenario, _global_view):
    _global_view("false", "false")
    r = client.get(f"/api/debug/warranty/{scenario.wid}", headers=scenario.other)
    assert r.status_code == 404


def test_non_owner_global_view_admin_only(client, scenario, _global_view):
    _global_view("true", "true")
    r = client.get(f"/api/debug/warranty/{scenario.wid}", headers=scenario.other)
    assert r.status_code == 404


def test_owner_with_global_view_off(client, scenario, _global_view):
    _global_view("false", "false")
    r = client.get(f"/api/debug/warranty/{scenario.wid}", headers=scenario.owner)
    assert r.status_code == 200


def test_admin_with_global_view_off(client, scenario, _global_view):
    _global_view("false", "false")
    r = client.get(f"/api/debug/warranty/{scenario.wid}", headers=scenario.admin)
    assert r.status_code == 200


def test_unauthenticated(client, scenario):
    r = client.get(f"/api/debug/warranty/{scenario.wid}")
    assert r.status_code == 401


def test_missing_warranty_global_view_on(client, scenario, _global_view):
    _global_view("true", "false")
    r = client.get("/api/debug/warranty/999999", headers=scenario.other)
    assert r.status_code == 404
