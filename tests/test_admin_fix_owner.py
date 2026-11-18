"""ADM-01: POST /api/admin/fix-owner-role imported ensure_owner_exists
from db_handler, where it does not live, so it returned 500 for every
authorized caller, with the internal error text in the body. The
function lives in the package __init__; the endpoint must succeed,
and failures must not disclose internal error text.
"""


def _promote(db_connection, username):
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE users SET is_admin = TRUE WHERE username = %s",
                    (username,))


def test_fix_owner_role_succeeds_for_admin(client, admin_user, db_connection):
    _promote(db_connection, admin_user["username"])
    r = client.post("/api/admin/fix-owner-role",
                    headers=admin_user["headers"], json={})
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["success"] is True


def test_fix_owner_role_rejects_non_admin(client, user_factory):
    user = user_factory()
    r = client.post("/api/admin/fix-owner-role",
                    headers=user["headers"], json={})
    assert r.status_code == 403


def test_fix_owner_role_failure_hides_internal_error(
        client, admin_user, db_connection, monkeypatch):
    _promote(db_connection, admin_user["username"])

    def boom():
        raise RuntimeError("s3cret-db-host.internal:5432 exploded")

    import backend
    monkeypatch.setattr(backend, "ensure_owner_exists", boom)
    r = client.post("/api/admin/fix-owner-role",
                    headers=admin_user["headers"], json={})
    assert r.status_code == 500
    body = r.get_data(as_text=True)
    assert "s3cret-db-host.internal" not in body
    assert "exploded" not in body
    assert r.get_json()["success"] is False
