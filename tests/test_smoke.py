"""Smoke tests: the app boots, auth works, warranty CRUD round-trips."""


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200


def test_warranties_require_auth(client):
    r = client.get("/api/warranties")
    assert r.status_code == 401


def test_login_round_trip(client, user_factory):
    user = user_factory()
    r = client.post("/api/auth/login", json={
        "username": user["username"], "password": "TestPass123!"})
    assert r.status_code == 200
    assert r.get_json()["token"]


def test_warranty_crud(client, user_factory, warranty_factory):
    user = user_factory()
    h = user["headers"]

    r = warranty_factory(h, product_name="Smoke Widget")
    assert r.status_code == 201, r.get_data(as_text=True)
    wid = r.get_json()["id"]

    r = client.get("/api/warranties", headers=h)
    assert r.status_code == 200
    body = r.get_json()
    items = body.get("warranties", body) if isinstance(body, dict) else body
    ids = [w["id"] for w in items]
    assert wid in ids

    # There is no single-warranty GET endpoint; reads go through the list.
    r = client.put(f"/api/warranties/{wid}", headers=h, data={
        "product_name": "Renamed Widget",
        "purchase_date": "2025-01-01",
        "exact_expiration_date": "2027-01-01",
        "is_lifetime": "false",
    })
    assert r.status_code == 200, r.get_data(as_text=True)

    r = client.get("/api/warranties", headers=h)
    body = r.get_json()
    items = body.get("warranties", body) if isinstance(body, dict) else body
    renamed = [w for w in items if w["id"] == wid]
    assert renamed and renamed[0]["product_name"] == "Renamed Widget"

    r = client.delete(f"/api/warranties/{wid}", headers=h)
    assert r.status_code in (200, 204), r.get_data(as_text=True)

    r = client.get("/api/warranties", headers=h)
    body = r.get_json()
    items = body.get("warranties", body) if isinstance(body, dict) else body
    assert wid not in [w["id"] for w in items]
