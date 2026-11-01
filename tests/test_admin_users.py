"""Admin user management (#134): the users list exposes each account's
auth provider, and an admin can correct a user's email address."""
import pytest


def _find_user(client, admin_headers, username):
    r = client.get("/api/admin/users", headers=admin_headers)
    assert r.status_code == 200, r.get_data(as_text=True)
    for user in r.get_json():
        if user["username"] == username:
            return user
    raise AssertionError(f"user {username} not in admin list")


def test_users_list_includes_auth_provider(client, admin_user, user_factory):
    plain = user_factory()
    user = _find_user(client, admin_user["headers"], plain["username"])
    assert user["auth_provider"] == "local"
    # The raw OIDC subject must never leak into the list payload.
    assert "oidc_sub" not in user


def test_admin_can_change_user_email(client, admin_user, user_factory):
    plain = user_factory()
    user = _find_user(client, admin_user["headers"], plain["username"])

    r = client.put(f"/api/admin/users/{user['id']}",
                   headers=admin_user["headers"],
                   json={"email": "corrected@test.local"})
    assert r.status_code == 200, r.get_data(as_text=True)

    user = _find_user(client, admin_user["headers"], plain["username"])
    assert user["email"] == "corrected@test.local"


def test_admin_email_change_validation(client, admin_user, user_factory):
    first = user_factory()
    second = user_factory()
    first_rec = _find_user(client, admin_user["headers"], first["username"])
    second_rec = _find_user(client, admin_user["headers"], second["username"])

    # Malformed address.
    r = client.put(f"/api/admin/users/{second_rec['id']}",
                   headers=admin_user["headers"],
                   json={"email": "not-an-email"})
    assert r.status_code == 400, r.get_data(as_text=True)

    # Address already used by another account.
    r = client.put(f"/api/admin/users/{second_rec['id']}",
                   headers=admin_user["headers"],
                   json={"email": first_rec["email"]})
    assert r.status_code == 400, r.get_data(as_text=True)

    # Keeping one's own current address is not a conflict.
    r = client.put(f"/api/admin/users/{second_rec['id']}",
                   headers=admin_user["headers"],
                   json={"email": second_rec["email"]})
    assert r.status_code == 200, r.get_data(as_text=True)


def test_non_admin_cannot_use_admin_endpoints(client, user_factory):
    plain = user_factory()
    r = client.get("/api/admin/users", headers=plain["headers"])
    assert r.status_code in (401, 403)
    r = client.put("/api/admin/users/1", headers=plain["headers"],
                   json={"email": "x@test.local"})
    assert r.status_code in (401, 403)
