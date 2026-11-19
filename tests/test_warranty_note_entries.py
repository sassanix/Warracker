"""Team note entries on warranties (next release).

Any authenticated user who may view a warranty may add a note entry to
it, and each entry carries its author and timestamp. The warranty's own
notes field is untouched. Deleting is for the entry author, the
warranty owner, or an admin. With global view off, or restricted to
admins, non-owners may neither view nor add.
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
def scenario(client, user_factory, warranty_factory):
    owner = user_factory()
    viewer = user_factory()
    other_viewer = user_factory()
    admin = user_factory()
    r = warranty_factory(owner["headers"], product_name="TeamNotesWidget")
    assert r.status_code == 201, r.get_data(as_text=True)
    return SimpleNamespace(
        owner=owner,
        viewer=viewer,
        other_viewer=other_viewer,
        admin=admin,
        wid=r.get_json()["id"],
    )


@pytest.fixture()
def _promoted_admin(scenario, db_connection):
    """Promote the scenario admin via the DB. The admin_user fixture is
    only an admin when registered first in the session, so tests that
    need an admin depend on this instead."""
    with db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (scenario.admin["username"],))
        admin_id = cur.fetchone()[0]
        cur.execute("UPDATE users SET is_admin = TRUE WHERE id = %s", (admin_id,))
    db_connection.commit()


def _add(client, scenario, headers, text):
    return client.post(
        f"/api/warranties/{scenario.wid}/notes",
        json={"text": text},
        headers=headers,
    )


def _list(client, scenario, headers):
    return client.get(f"/api/warranties/{scenario.wid}/notes", headers=headers)


def test_owner_adds_entry(client, scenario, _global_view):
    _global_view("false", "false")
    r = _add(client, scenario, scenario.owner["headers"], "owner entry")
    assert r.status_code == 201, r.get_data(as_text=True)
    body = r.get_json()
    assert body["username"] == scenario.owner["username"]
    assert body["text"] == "owner entry"
    assert body["created_at"]
    assert body["warranty_id"] == scenario.wid


def test_viewer_adds_entry_global_view_on(client, scenario, _global_view):
    _global_view("true", "false")
    r = _add(client, scenario, scenario.viewer["headers"], "viewer entry")
    assert r.status_code == 201, r.get_data(as_text=True)
    assert r.get_json()["username"] == scenario.viewer["username"]


def test_admin_adds_entry(client, scenario, _global_view, _promoted_admin):
    _global_view("false", "false")
    r = _add(client, scenario, scenario.admin["headers"], "admin entry")
    assert r.status_code == 201, r.get_data(as_text=True)


def test_viewer_add_forbidden_global_view_off(client, scenario, _global_view):
    _global_view("false", "false")
    r = _add(client, scenario, scenario.viewer["headers"], "should not land")
    assert r.status_code == 404


def test_viewer_add_forbidden_admin_only(client, scenario, _global_view):
    _global_view("true", "true")
    r = _add(client, scenario, scenario.viewer["headers"], "should not land")
    assert r.status_code == 404


def test_list_entries_oldest_first(client, scenario, _global_view):
    _global_view("true", "false")
    first = _add(client, scenario, scenario.owner["headers"], "list first").get_json()
    second = _add(client, scenario, scenario.viewer["headers"], "list second").get_json()
    r = _list(client, scenario, scenario.owner["headers"])
    assert r.status_code == 200, r.get_data(as_text=True)
    entries = r.get_json()
    ids = [e["id"] for e in entries]
    assert ids.index(first["id"]) < ids.index(second["id"])
    by_id = {e["id"]: e for e in entries}
    assert by_id[first["id"]]["username"] == scenario.owner["username"]
    assert by_id[second["id"]]["text"] == "list second"
    assert by_id[second["id"]]["created_at"]


def test_list_forbidden_global_view_off(client, scenario, _global_view):
    _global_view("false", "false")
    r = _list(client, scenario, scenario.viewer["headers"])
    assert r.status_code == 404


def test_validation_empty_and_missing_text(client, scenario):
    r = _add(client, scenario, scenario.owner["headers"], "   ")
    assert r.status_code == 400
    r = client.post(
        f"/api/warranties/{scenario.wid}/notes",
        json={},
        headers=scenario.owner["headers"],
    )
    assert r.status_code == 400


def test_validation_too_long(client, scenario):
    r = _add(client, scenario, scenario.owner["headers"], "x" * 5001)
    assert r.status_code == 400
    r = _add(client, scenario, scenario.owner["headers"], "x" * 5000)
    assert r.status_code == 201, r.get_data(as_text=True)


def test_delete_by_author(client, scenario, _global_view):
    _global_view("true", "false")
    entry = _add(client, scenario, scenario.viewer["headers"], "author deletes").get_json()
    r = client.delete(
        f"/api/warranties/{scenario.wid}/notes/{entry['id']}",
        headers=scenario.viewer["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)
    ids = [e["id"] for e in _list(client, scenario, scenario.owner["headers"]).get_json()]
    assert entry["id"] not in ids


def test_delete_by_owner(client, scenario, _global_view):
    _global_view("true", "false")
    entry = _add(client, scenario, scenario.viewer["headers"], "owner deletes").get_json()
    r = client.delete(
        f"/api/warranties/{scenario.wid}/notes/{entry['id']}",
        headers=scenario.owner["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)


def test_delete_by_admin(client, scenario, _global_view, _promoted_admin):
    _global_view("true", "false")
    entry = _add(client, scenario, scenario.viewer["headers"], "admin deletes").get_json()
    r = client.delete(
        f"/api/warranties/{scenario.wid}/notes/{entry['id']}",
        headers=scenario.admin["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)


def test_delete_forbidden_other_viewer(client, scenario, _global_view):
    _global_view("true", "false")
    entry = _add(client, scenario, scenario.viewer["headers"], "not yours").get_json()
    r = client.delete(
        f"/api/warranties/{scenario.wid}/notes/{entry['id']}",
        headers=scenario.other_viewer["headers"],
    )
    assert r.status_code == 403, r.get_data(as_text=True)
    ids = [e["id"] for e in _list(client, scenario, scenario.owner["headers"]).get_json()]
    assert entry["id"] in ids


def test_delete_missing_entry(client, scenario):
    r = client.delete(
        f"/api/warranties/{scenario.wid}/notes/999999",
        headers=scenario.owner["headers"],
    )
    assert r.status_code == 404


def test_missing_warranty(client, scenario):
    r = client.get("/api/warranties/999999/notes", headers=scenario.owner["headers"])
    assert r.status_code == 404
    r = client.post(
        "/api/warranties/999999/notes",
        json={"text": "nope"},
        headers=scenario.owner["headers"],
    )
    assert r.status_code == 404
    r = client.delete(
        "/api/warranties/999999/notes/1",
        headers=scenario.owner["headers"],
    )
    assert r.status_code == 404


def test_unauthenticated(client, scenario):
    r = client.get(f"/api/warranties/{scenario.wid}/notes")
    assert r.status_code == 401
