"""Warranty lifecycle, cross-user ownership, global view, and metadata routes.

Covers core application endpoints that previously had no regression tests:
- PATCH /api/warranties/<id>/archive and GET /api/warranties/archived
- PATCH /api/warranties/<id>/void (void and restore)
- Cross-user authorization on PUT, DELETE, archive, and void (non-owner vs admin)
- GET /api/warranties/global, /api/warranties/global/archived, and
  GET /api/settings/global-view-status across all three visibility modes
- GET /api/admin/warranties (admin-only enforcement and active-only filtering)
- GET /api/timezones and GET /api/locales
"""
import pytest

from backend.localization import SUPPORTED_LANGUAGES


def _promote(db_connection, username):
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "UPDATE users SET is_admin = TRUE WHERE username = %s",
            (username,),
        )


@pytest.fixture()
def _global_view_setting(db_connection):
    """Set global_view_enabled / global_view_admin_only and restore afterward."""
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


def test_archive_and_unarchive_warranty_lifecycle(
        client, user_factory, warranty_factory):
    user = user_factory()
    h = user["headers"]
    wid = warranty_factory(h, product_name="Archive Desk").get_json()["id"]

    # Initially active, not archived.
    active_ids = [w["id"] for w in client.get("/api/warranties", headers=h).get_json()]
    archived_ids = [w["id"] for w in client.get("/api/warranties/archived", headers=h).get_json()]
    assert wid in active_ids
    assert wid not in archived_ids

    # Missing boolean rejected with 400.
    r_bad = client.patch(f"/api/warranties/{wid}/archive", headers=h, json={})
    assert r_bad.status_code == 400

    # Archive moves warranty out of active list and into archived list.
    r_arch = client.patch(
        f"/api/warranties/{wid}/archive", headers=h, json={"archived": True}
    )
    assert r_arch.status_code == 200, r_arch.get_data(as_text=True)
    assert r_arch.get_json()["archived"] is True

    active_ids = [w["id"] for w in client.get("/api/warranties", headers=h).get_json()]
    archived_ids = [w["id"] for w in client.get("/api/warranties/archived", headers=h).get_json()]
    assert wid not in active_ids
    assert wid in archived_ids

    # Unarchive restores warranty to active list.
    r_unarch = client.patch(
        f"/api/warranties/{wid}/archive", headers=h, json={"archived": False}
    )
    assert r_unarch.status_code == 200, r_unarch.get_data(as_text=True)
    assert r_unarch.get_json()["archived"] is False

    active_ids = [w["id"] for w in client.get("/api/warranties", headers=h).get_json()]
    archived_ids = [w["id"] for w in client.get("/api/warranties/archived", headers=h).get_json()]
    assert wid in active_ids
    assert wid not in archived_ids


def test_void_and_unvoid_warranty_lifecycle(
        client, user_factory, warranty_factory):
    user = user_factory()
    h = user["headers"]
    wid = warranty_factory(h, product_name="Voidable Mixer").get_json()["id"]

    r_bad = client.patch(f"/api/warranties/{wid}/void", headers=h, json={})
    assert r_bad.status_code == 400

    r_void = client.patch(
        f"/api/warranties/{wid}/void", headers=h, json={"voided": True}
    )
    assert r_void.status_code == 200, r_void.get_data(as_text=True)
    assert r_void.get_json()["voided"] is True

    w_row = next(
        w for w in client.get("/api/warranties", headers=h).get_json()
        if w["id"] == wid
    )
    assert w_row["voided_at"] is not None

    r_restore = client.patch(
        f"/api/warranties/{wid}/void", headers=h, json={"voided": False}
    )
    assert r_restore.status_code == 200, r_restore.get_data(as_text=True)
    assert r_restore.get_json()["voided"] is False

    w_row = next(
        w for w in client.get("/api/warranties", headers=h).get_json()
        if w["id"] == wid
    )
    assert w_row["voided_at"] is None


def test_cross_user_warranty_mutation_blocked_for_stranger_allowed_for_admin(
        client, admin_user, user_factory, warranty_factory, db_connection):
    _promote(db_connection, admin_user["username"])
    owner = user_factory()
    stranger = user_factory()
    wid = warranty_factory(owner["headers"], product_name="Owner Watch").get_json()["id"]

    # Another regular user cannot archive, void, edit, or delete owner's warranty.
    assert client.patch(
        f"/api/warranties/{wid}/archive",
        headers=stranger["headers"],
        json={"archived": True},
    ).status_code == 404
    assert client.patch(
        f"/api/warranties/{wid}/void",
        headers=stranger["headers"],
        json={"voided": True},
    ).status_code == 404
    assert client.put(
        f"/api/warranties/{wid}",
        headers=stranger["headers"],
        data={"product_name": "Hijacked"},
    ).status_code in (403, 404)
    assert client.delete(
        f"/api/warranties/{wid}",
        headers=stranger["headers"],
    ).status_code == 404

    # An admin can archive, void, restore, edit, and delete any user's warranty.
    assert client.patch(
        f"/api/warranties/{wid}/archive",
        headers=admin_user["headers"],
        json={"archived": True},
    ).status_code == 200
    assert client.patch(
        f"/api/warranties/{wid}/archive",
        headers=admin_user["headers"],
        json={"archived": False},
    ).status_code == 200
    assert client.patch(
        f"/api/warranties/{wid}/void",
        headers=admin_user["headers"],
        json={"voided": True},
    ).status_code == 200
    assert client.delete(
        f"/api/warranties/{wid}",
        headers=admin_user["headers"],
    ).status_code == 200


def test_global_warranties_and_status_respect_visibility_settings(
        client, admin_user, user_factory, warranty_factory,
        db_connection, _global_view_setting):
    _promote(db_connection, admin_user["username"])
    alice = user_factory()
    bob = user_factory()

    w_active = warranty_factory(
        alice["headers"], product_name="Global Active Item"
    ).get_json()["id"]
    w_archived = warranty_factory(
        bob["headers"], product_name="Global Archived Item"
    ).get_json()["id"]
    assert client.patch(
        f"/api/warranties/{w_archived}/archive",
        headers=bob["headers"],
        json={"archived": True},
    ).status_code == 200

    # 1. Global view enabled for everyone.
    _global_view_setting("true", "false")
    r_status = client.get("/api/settings/global-view-status", headers=alice["headers"])
    assert r_status.status_code == 200
    assert r_status.get_json()["enabled"] is True

    r_global = client.get("/api/warranties/global", headers=bob["headers"])
    assert r_global.status_code == 200, r_global.get_data(as_text=True)
    global_ids = {w["id"] for w in r_global.get_json()}
    assert w_active in global_ids
    assert w_archived not in global_ids

    r_global_arch = client.get("/api/warranties/global/archived", headers=alice["headers"])
    assert r_global_arch.status_code == 200, r_global_arch.get_data(as_text=True)
    global_arch_ids = {w["id"] for w in r_global_arch.get_json()}
    assert w_archived in global_arch_ids
    assert w_active not in global_arch_ids

    # 2. Global view restricted to admins only.
    _global_view_setting("true", "true")
    assert client.get(
        "/api/settings/global-view-status", headers=alice["headers"]
    ).get_json()["enabled"] is False
    assert client.get(
        "/api/settings/global-view-status", headers=admin_user["headers"]
    ).get_json()["enabled"] is True

    assert client.get("/api/warranties/global", headers=alice["headers"]).status_code == 403
    assert client.get("/api/warranties/global/archived", headers=alice["headers"]).status_code == 403
    assert client.get("/api/warranties/global", headers=admin_user["headers"]).status_code == 200
    assert client.get("/api/warranties/global/archived", headers=admin_user["headers"]).status_code == 200

    # 3. Global view disabled completely.
    _global_view_setting("false", "false")
    assert client.get(
        "/api/settings/global-view-status", headers=admin_user["headers"]
    ).get_json()["enabled"] is False
    assert client.get("/api/warranties/global", headers=admin_user["headers"]).status_code == 403
    assert client.get("/api/warranties/global/archived", headers=admin_user["headers"]).status_code == 403


def test_admin_warranties_endpoint_requires_admin_and_excludes_archived(
        client, admin_user, user_factory, warranty_factory, db_connection):
    _promote(db_connection, admin_user["username"])
    user = user_factory()
    w_active = warranty_factory(user["headers"], product_name="Admin List Active").get_json()["id"]
    w_arch = warranty_factory(user["headers"], product_name="Admin List Archived").get_json()["id"]
    assert client.patch(
        f"/api/warranties/{w_arch}/archive",
        headers=user["headers"],
        json={"archived": True},
    ).status_code == 200

    assert client.get("/api/admin/warranties", headers=user["headers"]).status_code == 403

    r_admin = client.get("/api/admin/warranties", headers=admin_user["headers"])
    assert r_admin.status_code == 200, r_admin.get_data(as_text=True)
    ids = {w["id"] for w in r_admin.get_json()}
    assert w_active in ids
    assert w_arch not in ids


def test_timezones_and_locales_metadata_endpoints(client, user_factory):
    user = user_factory()

    # /api/timezones requires auth and returns region-grouped IANA zones.
    assert client.get("/api/timezones").status_code == 401
    r_tz = client.get("/api/timezones", headers=user["headers"])
    assert r_tz.status_code == 200
    regions = {group["region"]: group["timezones"] for group in r_tz.get_json()}
    assert "America" in regions and "Europe" in regions
    assert any(z["value"] == "America/New_York" for z in regions["America"])

    # /api/locales is public and returns every SUPPORTED_LANGUAGES entry
    # with a human-readable native name (never falling back to raw code).
    r_loc = client.get("/api/locales")
    assert r_loc.status_code == 200
    locales = r_loc.get_json()
    by_code = {entry["code"]: entry for entry in locales}
    assert set(by_code.keys()) == set(SUPPORTED_LANGUAGES)
    for code, entry in by_code.items():
        assert entry["native_name"] != code, f"missing display name for locale {code}"
