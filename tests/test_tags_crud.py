"""Direct tag CRUD and warranty-tag association routes.

Complements tests/test_tag_ownership.py (which pins warranty create/update
against foreign tag IDs) by covering:
- POST /api/tags validation, per-user uniqueness, and cross-user isolation
- GET /api/tags per-user scoping
- PUT /api/tags/<id> rename/recolor, validation, conflict, and 403 for non-owners
- DELETE /api/tags/<id> 403 for non-owners and cleanup of warranty_tags links
- GET & POST /api/warranties/<id>/tags ownership, replacement, and admin read
"""


def _promote(db_connection, username):
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "UPDATE users SET is_admin = TRUE WHERE username = %s",
            (username,),
        )


def test_tag_create_validation_and_per_user_uniqueness(client, user_factory):
    alice = user_factory()
    bob = user_factory()

    # Empty name, missing name, invalid hex color rejected.
    assert client.post("/api/tags", headers=alice["headers"], json={}).status_code == 400
    assert client.post(
        "/api/tags", headers=alice["headers"], json={"name": "   "}
    ).status_code == 400
    assert client.post(
        "/api/tags",
        headers=alice["headers"],
        json={"name": "Home", "color": "not-a-hex"},
    ).status_code == 400

    # Valid creation succeeds.
    r1 = client.post(
        "/api/tags",
        headers=alice["headers"],
        json={"name": "Electronics", "color": "#112233"},
    )
    assert r1.status_code == 201, r1.get_data(as_text=True)
    tag_id = r1.get_json()["id"]

    # Duplicate for the same user returns 409.
    r_dup = client.post(
        "/api/tags",
        headers=alice["headers"],
        json={"name": "Electronics", "color": "#445566"},
    )
    assert r_dup.status_code == 409

    # Another user CAN create a tag with the same name; GET /api/tags is scoped.
    r_bob = client.post(
        "/api/tags",
        headers=bob["headers"],
        json={"name": "Electronics", "color": "#778899"},
    )
    assert r_bob.status_code == 201
    alice_tags = client.get("/api/tags", headers=alice["headers"]).get_json()
    bob_tags = client.get("/api/tags", headers=bob["headers"]).get_json()
    assert [t["id"] for t in alice_tags] == [tag_id]
    assert [t["id"] for t in bob_tags] == [r_bob.get_json()["id"]]


def test_tag_update_validation_conflicts_and_ownership(client, user_factory):
    alice = user_factory()
    bob = user_factory()

    t1 = client.post(
        "/api/tags", headers=alice["headers"], json={"name": "Kitchen", "color": "#AA0000"}
    ).get_json()["id"]
    t2 = client.post(
        "/api/tags", headers=alice["headers"], json={"name": "Garage", "color": "#00AA00"}
    ).get_json()["id"]

    # Validation checks on PUT.
    assert client.put(
        f"/api/tags/{t1}", headers=alice["headers"], json={"name": "", "color": "#0000AA"}
    ).status_code == 400
    assert client.put(
        f"/api/tags/{t1}", headers=alice["headers"], json={"name": "x" * 51, "color": "#0000AA"}
    ).status_code == 400
    assert client.put(
        f"/api/tags/{t1}", headers=alice["headers"], json={"name": "Kitchen", "color": "blue"}
    ).status_code == 400

    # Conflict with another tag of the same user returns 409.
    assert client.put(
        f"/api/tags/{t1}", headers=alice["headers"], json={"name": "Garage", "color": "#0000AA"}
    ).status_code == 409

    # Nonexistent tag returns 404.
    assert client.put(
        "/api/tags/99999999", headers=alice["headers"], json={"name": "Ghost", "color": "#0000AA"}
    ).status_code == 404

    # Another user gets 403 trying to update Alice's tag.
    assert client.put(
        f"/api/tags/{t1}", headers=bob["headers"], json={"name": "Stolen", "color": "#0000AA"}
    ).status_code == 403

    # Owner update succeeds.
    r_ok = client.put(
        f"/api/tags/{t1}",
        headers=alice["headers"],
        json={"name": "Appliances", "color": "#123456"},
    )
    assert r_ok.status_code == 200, r_ok.get_data(as_text=True)
    assert r_ok.get_json() == {"id": t1, "name": "Appliances", "color": "#123456"}
    assert t2 != t1


def test_tag_delete_ownership_and_warranty_tag_routes(
        client, admin_user, user_factory, warranty_factory, db_connection):
    _promote(db_connection, admin_user["username"])
    alice = user_factory()
    bob = user_factory()

    t1 = client.post(
        "/api/tags", headers=alice["headers"], json={"name": "Office", "color": "#336699"}
    ).get_json()["id"]
    t2 = client.post(
        "/api/tags", headers=alice["headers"], json={"name": "Travel", "color": "#996633"}
    ).get_json()["id"]
    bob_tag = client.post(
        "/api/tags", headers=bob["headers"], json={"name": "BobTag", "color": "#111111"}
    ).get_json()["id"]

    wid = warranty_factory(alice["headers"], product_name="Tagged Monitor").get_json()["id"]

    # Bad payloads on POST /warranties/<id>/tags return 400.
    assert client.post(
        f"/api/warranties/{wid}/tags", headers=alice["headers"], json={}
    ).status_code == 400
    assert client.post(
        f"/api/warranties/{wid}/tags", headers=alice["headers"], json={"tag_ids": "not-a-list"}
    ).status_code == 400

    # Linking another user's tag via POST /warranties/<id>/tags is rejected (404).
    assert client.post(
        f"/api/warranties/{wid}/tags",
        headers=alice["headers"],
        json={"tag_ids": [bob_tag]},
    ).status_code == 404

    # Non-owner cannot read or modify Alice's warranty tags.
    assert client.get(
        f"/api/warranties/{wid}/tags", headers=bob["headers"]
    ).status_code == 404
    assert client.post(
        f"/api/warranties/{wid}/tags",
        headers=bob["headers"],
        json={"tag_ids": [bob_tag]},
    ).status_code == 404

    # Owner links t1 and t2, then reads them back.
    r_link = client.post(
        f"/api/warranties/{wid}/tags",
        headers=alice["headers"],
        json={"tag_ids": [t1, t2]},
    )
    assert r_link.status_code == 200, r_link.get_data(as_text=True)

    r_get = client.get(f"/api/warranties/{wid}/tags", headers=alice["headers"])
    assert r_get.status_code == 200
    assert [t["id"] for t in r_get.get_json()] == [t1, t2]

    # Admin can inspect tags on Alice's warranty.
    r_admin = client.get(f"/api/warranties/{wid}/tags", headers=admin_user["headers"])
    assert r_admin.status_code == 200
    assert [t["id"] for t in r_admin.get_json()] == [t1, t2]

    # Bob gets 403 trying to delete Alice's tag; nonexistent tag returns 404.
    assert client.delete(f"/api/tags/{t1}", headers=bob["headers"]).status_code == 403
    assert client.delete("/api/tags/99999999", headers=alice["headers"]).status_code == 404

    # Deleting t1 cleans up its warranty_tags association too.
    r_del = client.delete(f"/api/tags/{t1}", headers=alice["headers"])
    assert r_del.status_code == 200
    remaining = client.get(f"/api/warranties/{wid}/tags", headers=alice["headers"]).get_json()
    assert [t["id"] for t in remaining] == [t2]

    # Empty tag_ids clears remaining tags cleanly.
    assert client.post(
        f"/api/warranties/{wid}/tags",
        headers=alice["headers"],
        json={"tag_ids": []},
    ).status_code == 200
    assert client.get(f"/api/warranties/{wid}/tags", headers=alice["headers"]).get_json() == []
