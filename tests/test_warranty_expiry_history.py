"""Tests for warranty expiration date / lifetime change history (issue #209)."""
import os
import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _create_warranty(client, headers, **overrides):
    data = {
        "product_name": "Test Laptop",
        "purchase_date": "2025-01-01",
        "exact_expiration_date": "2027-01-01",
    }
    data.update(overrides)
    r = client.post("/api/warranties", data=data, headers=headers)
    assert r.status_code in (200, 201), r.get_data(as_text=True)
    return r.get_json()["id"]


def _set_global_view(client, admin_headers, enabled, admin_only):
    r = client.put(
        "/api/admin/settings",
        json={
            "global_view_enabled": "true" if enabled else "false",
            "global_view_admin_only": "true" if admin_only else "false",
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, r.get_data(as_text=True)


def test_unchanged_edits_do_not_record_expiry_history(client, user_factory):
    user = user_factory()
    wid = _create_warranty(
        client,
        user["headers"],
        product_name="Unchanged Widget",
        purchase_date="2025-01-01",
        exact_expiration_date="2027-01-01",
    )

    # 1. Edit metadata while keeping the same exact expiration date
    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Unchanged Widget Renamed",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2027-01-01",
            "vendor": "Acme Store",
            "notes": "Updated notes only",
            "expiry_change_reason": "Should not be logged because date did not change",
        },
        headers=user["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    # 2. Switch from exact date to equivalent 2-year duration (still 2027-01-01)
    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Unchanged Widget Renamed",
            "purchase_date": "2025-01-01",
            "warranty_duration_years": "2",
            "warranty_duration_months": "0",
            "warranty_duration_days": "0",
        },
        headers=user["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    # 3. JSON-only notes update shortcut
    r = client.put(
        f"/api/warranties/{wid}",
        json={"notes": "Quick notes update"},
        headers=user["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    hist = client.get(f"/api/warranties/{wid}/expiry-history", headers=user["headers"])
    assert hist.status_code == 200
    assert hist.get_json() == []

    warranties = client.get("/api/warranties", headers=user["headers"]).get_json()
    match = next(w for w in warranties if w["id"] == wid)
    assert match["expiry_change_count"] == 0


def test_expiry_history_records_date_duration_and_lifetime_transitions(client, user_factory):
    user = user_factory()
    wid = _create_warranty(
        client,
        user["headers"],
        product_name="Repairable Camera",
        purchase_date="2025-01-01",
        exact_expiration_date="2026-01-01",
    )

    # 1. Exact date extension with optional reason (whitespace trimmed)
    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Repairable Camera",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2026-07-01",
            "expiry_change_reason": "  Extended 6 months after repair claim  ",
        },
        headers=user["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    # 2. Duration-based update (3 years from 2025-01-01 -> 2028-01-01), no reason
    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Repairable Camera",
            "purchase_date": "2025-01-01",
            "warranty_duration_years": "3",
            "warranty_duration_months": "0",
            "warranty_duration_days": "0",
        },
        headers=user["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    # 3. Switch to lifetime warranty
    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Repairable Camera",
            "purchase_date": "2025-01-01",
            "is_lifetime": "true",
            "expiry_change_reason": "Upgraded to lifetime coverage",
        },
        headers=user["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    # 4. Re-saving lifetime with no expiry change should NOT add a row
    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Repairable Camera Pro",
            "purchase_date": "2025-01-01",
            "is_lifetime": "true",
        },
        headers=user["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    # 5. Switch from lifetime back to an exact date
    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Repairable Camera Pro",
            "purchase_date": "2025-01-01",
            "is_lifetime": "false",
            "exact_expiration_date": "2030-01-01",
            "expiry_change_reason": "Corrected from lifetime to 5-year limit",
        },
        headers=user["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    resp = client.get(f"/api/warranties/{wid}/expiry-history", headers=user["headers"])
    assert resp.status_code == 200
    entries = resp.get_json()
    assert len(entries) == 4

    # Ordered newest-first
    assert entries[0]["previous_is_lifetime"] is True
    assert entries[0]["previous_expiration_date"] is None
    assert entries[0]["new_is_lifetime"] is False
    assert entries[0]["new_expiration_date"] == "2030-01-01"
    assert entries[0]["reason"] == "Corrected from lifetime to 5-year limit"
    assert entries[0]["changed_by"] == "Test User"
    assert entries[0]["changed_at"]

    assert entries[1]["previous_is_lifetime"] is False
    assert entries[1]["previous_expiration_date"] == "2028-01-01"
    assert entries[1]["new_is_lifetime"] is True
    assert entries[1]["new_expiration_date"] is None
    assert entries[1]["reason"] == "Upgraded to lifetime coverage"

    assert entries[2]["previous_expiration_date"] == "2026-07-01"
    assert entries[2]["new_expiration_date"] == "2028-01-01"
    assert entries[2]["reason"] is None

    assert entries[3]["previous_expiration_date"] == "2026-01-01"
    assert entries[3]["new_expiration_date"] == "2026-07-01"
    assert entries[3]["reason"] == "Extended 6 months after repair claim"


def test_expiry_change_reason_length_limit_rejected(client, user_factory):
    user = user_factory()
    wid = _create_warranty(client, user["headers"], exact_expiration_date="2027-01-01")

    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Test Laptop",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2028-01-01",
            "expiry_change_reason": "x" * 256,
        },
        headers=user["headers"],
    )
    assert r.status_code == 400
    payload = r.get_json()
    assert payload["code"] == "expiry_change_reason_too_long"

    # Warranty date and history must be untouched
    hist = client.get(f"/api/warranties/{wid}/expiry-history", headers=user["headers"]).get_json()
    assert hist == []


def test_expiry_change_count_exposed_across_list_debug_and_stats_endpoints(
    client, admin_user, user_factory
):
    user = user_factory()
    wid = _create_warranty(
        client,
        user["headers"],
        product_name="Counted Device",
        exact_expiration_date="2026-06-01",
    )

    for new_date in ("2027-06-01", "2028-06-01"):
        r = client.put(
            f"/api/warranties/{wid}",
            data={
                "product_name": "Counted Device",
                "purchase_date": "2025-01-01",
                "exact_expiration_date": new_date,
            },
            headers=user["headers"],
        )
        assert r.status_code == 200

    _set_global_view(client, admin_user["headers"], enabled=True, admin_only=False)
    try:
        # Personal list
        personal = client.get("/api/warranties", headers=user["headers"]).get_json()
        assert next(w for w in personal if w["id"] == wid)["expiry_change_count"] == 2

        # Admin list
        admin_list = client.get("/api/admin/warranties", headers=admin_user["headers"]).get_json()
        assert next(w for w in admin_list if w["id"] == wid)["expiry_change_count"] == 2

        # Global list
        global_list = client.get("/api/warranties/global", headers=user["headers"]).get_json()
        assert next(w for w in global_list if w["id"] == wid)["expiry_change_count"] == 2

        # Debug endpoint
        debug_w = client.get(f"/api/debug/warranty/{wid}", headers=user["headers"]).get_json()
        assert debug_w["expiry_change_count"] == 2

        # Personal statistics all_warranties
        stats = client.get("/api/statistics", headers=user["headers"]).get_json()
        assert next(w for w in stats["all_warranties"] if w["id"] == wid)["expiry_change_count"] == 2

        # Global statistics all_warranties
        gstats = client.get("/api/statistics/global", headers=user["headers"]).get_json()
        assert next(w for w in gstats["all_warranties"] if w["id"] == wid)["expiry_change_count"] == 2

        # Archive and verify archived + global/archived lists
        arch = client.patch(
            f"/api/warranties/{wid}/archive",
            json={"archived": True},
            headers=user["headers"],
        )
        assert arch.status_code == 200

        archived = client.get("/api/warranties/archived", headers=user["headers"]).get_json()
        assert next(w for w in archived if w["id"] == wid)["expiry_change_count"] == 2

        g_archived = client.get("/api/warranties/global/archived", headers=user["headers"]).get_json()
        assert next(w for w in g_archived if w["id"] == wid)["expiry_change_count"] == 2
    finally:
        _set_global_view(client, admin_user["headers"], enabled=True, admin_only=False)


def test_expiry_history_access_control_matrix(client, admin_user, user_factory):
    owner = user_factory()
    stranger = user_factory()
    wid = _create_warranty(client, owner["headers"], exact_expiration_date="2026-01-01")
    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Test Laptop",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2027-01-01",
            "expiry_change_reason": "Warranty extension",
        },
        headers=owner["headers"],
    )
    assert r.status_code == 200

    try:
        # 1. Global view enabled for all -> owner, admin, stranger all see history
        _set_global_view(client, admin_user["headers"], enabled=True, admin_only=False)
        assert client.get(f"/api/warranties/{wid}/expiry-history", headers=owner["headers"]).status_code == 200
        assert client.get(f"/api/warranties/{wid}/expiry-history", headers=admin_user["headers"]).status_code == 200
        stranger_resp = client.get(f"/api/warranties/{wid}/expiry-history", headers=stranger["headers"])
        assert stranger_resp.status_code == 200
        assert len(stranger_resp.get_json()) == 1

        # 2. Global view admin-only -> stranger gets 404, owner & admin get 200
        _set_global_view(client, admin_user["headers"], enabled=True, admin_only=True)
        assert client.get(f"/api/warranties/{wid}/expiry-history", headers=owner["headers"]).status_code == 200
        assert client.get(f"/api/warranties/{wid}/expiry-history", headers=admin_user["headers"]).status_code == 200
        assert client.get(f"/api/warranties/{wid}/expiry-history", headers=stranger["headers"]).status_code == 404

        # 3. Global view disabled -> stranger gets 404, owner & admin still get 200
        _set_global_view(client, admin_user["headers"], enabled=False, admin_only=False)
        assert client.get(f"/api/warranties/{wid}/expiry-history", headers=owner["headers"]).status_code == 200
        assert client.get(f"/api/warranties/{wid}/expiry-history", headers=admin_user["headers"]).status_code == 200
        assert client.get(f"/api/warranties/{wid}/expiry-history", headers=stranger["headers"]).status_code == 404

        # 4. Non-existent warranty returns 404 even for admin
        assert client.get("/api/warranties/99999999/expiry-history", headers=admin_user["headers"]).status_code == 404
    finally:
        _set_global_view(client, admin_user["headers"], enabled=True, admin_only=False)


def test_expiry_history_cascade_and_deleted_editor_nullability(
    client, admin_user, user_factory, db_connection
):
    owner = user_factory()
    editor = user_factory()
    wid = _create_warranty(client, owner["headers"], exact_expiration_date="2026-01-01")

    # Promote editor to admin so they can edit owner's warranty, then delete editor
    with db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (editor["username"],))
        editor_id = cur.fetchone()[0]
        cur.execute("UPDATE users SET is_admin = TRUE WHERE id = %s", (editor_id,))
    db_connection.commit()

    # Re-login editor so token carries is_admin=True
    login_r = client.post(
        "/api/auth/login",
        json={"username": editor["username"], "password": "TestPass123!"},
    )
    assert login_r.status_code == 200
    editor_admin_headers = {"Authorization": f"Bearer {login_r.get_json()['token']}"}

    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Test Laptop",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2028-01-01",
            "expiry_change_reason": "Adjusted by support admin",
        },
        headers=editor_admin_headers,
    )
    assert r.status_code == 200

    # Delete editor account; ON DELETE SET NULL keeps history intact with changed_by=None
    del_u = client.delete(f"/api/admin/users/{editor_id}", headers=admin_user["headers"])
    assert del_u.status_code == 200, del_u.get_data(as_text=True)

    hist = client.get(f"/api/warranties/{wid}/expiry-history", headers=owner["headers"])
    assert hist.status_code == 200
    entries = hist.get_json()
    assert len(entries) == 1
    assert entries[0]["changed_by"] is None
    assert entries[0]["reason"] == "Adjusted by support admin"

    # Delete warranty; ON DELETE CASCADE removes all expiry history rows
    del_w = client.delete(f"/api/warranties/{wid}", headers=owner["headers"])
    assert del_w.status_code == 200

    with db_connection.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM warranty_expiry_history WHERE warranty_id = %s", (wid,))
        assert cur.fetchone()[0] == 0


def test_expiry_history_frontend_uses_dom_textcontent_not_innerhtml():
    src_path = os.path.join(REPO_ROOT, "frontend", "js", "components", "expiryHistory.js")
    with open(src_path, encoding="utf-8") as fh:
        src = fh.read()
    assert "innerHTML" not in src
    assert "reasonEl.textContent" in src
    assert "metaEl.textContent" in src


def test_legacy_lifetime_with_stale_date_does_not_log_lifetime_to_lifetime(
    client, user_factory, db_connection
):
    user = user_factory()
    wid = _create_warranty(
        client,
        user["headers"],
        product_name="Legacy Lifetime",
        purchase_date="2025-01-01",
        is_lifetime="true",
    )
    # Simulate a legacy lifetime row that still carried a non-null expiration_date
    with db_connection.cursor() as cur:
        cur.execute(
            "UPDATE warranties SET expiration_date = '2099-01-01' WHERE id = %s",
            (wid,),
        )
    db_connection.commit()

    r = client.put(
        f"/api/warranties/{wid}",
        data={
            "product_name": "Legacy Lifetime Renamed",
            "purchase_date": "2025-01-01",
            "is_lifetime": "true",
        },
        headers=user["headers"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    hist = client.get(f"/api/warranties/{wid}/expiry-history", headers=user["headers"])
    assert hist.status_code == 200
    assert hist.get_json() == []

