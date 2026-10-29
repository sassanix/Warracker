"""Validation limits, statistics buckets, claim statuses, CSV import.

Ported from the QA regression script test_fixes.py (16 checks), which
verified fixes for findings F1-F5. Each test uses its own fresh user
so statistics counts stay isolated.
"""
import io
from datetime import date, timedelta

TODAY = date.today()
TODAY_S = TODAY.isoformat()
NEXT_YEAR = (TODAY + timedelta(days=365)).isoformat()


def _add(client, headers, name, purchase, exp_date=None, lifetime=False,
         duration=None):
    form = {"product_name": name, "purchase_date": purchase,
            "is_lifetime": str(lifetime).lower()}
    if exp_date:
        form["exact_expiration_date"] = exp_date
    if duration:
        form.update({"warranty_duration_years": str(duration[0]),
                     "warranty_duration_months": str(duration[1]),
                     "warranty_duration_days": str(duration[2])})
    return client.post("/api/warranties", data=form, headers=headers)


def test_product_name_length(client, user_factory):
    h = user_factory()["headers"]
    r = _add(client, h, "x" * 500, TODAY_S, exp_date=NEXT_YEAR)
    assert r.status_code == 400
    r = _add(client, h, "x" * 255, TODAY_S, exp_date=NEXT_YEAR)
    assert r.status_code == 201, r.get_data(as_text=True)
    wid = r.get_json()["id"]
    r = client.put(f"/api/warranties/{wid}", headers=h, data={
        "product_name": "y" * 500, "purchase_date": TODAY_S,
        "exact_expiration_date": NEXT_YEAR, "is_lifetime": "false"})
    assert r.status_code == 400


def test_expiration_not_before_purchase(client, user_factory):
    h = user_factory()["headers"]
    r = _add(client, h, "Backwards", TODAY_S,
             exp_date=(TODAY - timedelta(days=10)).isoformat())
    assert r.status_code == 400
    r = _add(client, h, "Backwards2", TODAY_S, exp_date=TODAY_S)
    assert r.status_code == 201, r.get_data(as_text=True)

    r = _add(client, h, "OK name", TODAY_S, exp_date=NEXT_YEAR)
    wid = r.get_json()["id"]
    r = client.put(f"/api/warranties/{wid}", headers=h, data={
        "product_name": "OK name", "purchase_date": TODAY_S,
        "exact_expiration_date": (TODAY - timedelta(days=5)).isoformat(),
        "is_lifetime": "false"})
    assert r.status_code == 400


def test_statistics_buckets(client, user_factory):
    h = user_factory()["headers"]
    # Two long-lived warranties plus one expiring today.
    for name in ("LongA", "LongB"):
        r = _add(client, h, name, TODAY_S, exp_date=NEXT_YEAR)
        assert r.status_code == 201, r.get_data(as_text=True)
    r = _add(client, h, "ExpiresToday",
             (TODAY - timedelta(days=364)).isoformat(), exp_date=TODAY_S)
    assert r.status_code == 201, r.get_data(as_text=True)
    r = _add(client, h, "ExpiredY",
             (TODAY - timedelta(days=400)).isoformat(),
             exp_date=(TODAY - timedelta(days=1)).isoformat())
    assert r.status_code == 201, r.get_data(as_text=True)

    st = client.get("/api/statistics", headers=h).get_json()
    assert st["expired"] == 1            # only yesterday's
    assert st["expiring_soon"] >= 1      # today's is expiring, not expired
    assert st["active"] >= 3             # two long-lived + today's


def test_claim_status_validation(client, user_factory, warranty_factory):
    h = user_factory()["headers"]
    wid = warranty_factory(h).get_json()["id"]

    r = client.post(f"/api/warranties/{wid}/claims", headers=h, json={
        "claim_date": TODAY_S, "status": "Bogus"})
    assert r.status_code == 400
    r = client.post(f"/api/warranties/{wid}/claims", headers=h, json={
        "claim_date": TODAY_S, "status": "Submitted"})
    assert r.status_code == 201, r.get_data(as_text=True)
    cid = r.get_json()["id"]

    r = client.put(f"/api/warranties/{wid}/claims/{cid}", headers=h,
                   json={"status": "Nope"})
    assert r.status_code == 400
    r = client.put(f"/api/warranties/{wid}/claims/{cid}", headers=h,
                   json={"status": "In Progress"})
    assert r.status_code == 200


def test_serial_number_too_long(client, user_factory):
    h = user_factory()["headers"]
    base = {"product_name": "SerialWidget", "purchase_date": TODAY_S,
            "exact_expiration_date": NEXT_YEAR}
    r = client.post("/api/warranties", headers=h,
                    data={**base, "serial_numbers[]": ["x" * 300]})
    assert r.status_code == 400
    assert r.get_json()["code"] == "serial_number_too_long"
    r = client.post("/api/warranties", headers=h,
                    data={**base, "serial_numbers[]": ["x" * 255]})
    assert r.status_code == 201, r.get_data(as_text=True)


def test_whitespace_only_product_name(client, user_factory):
    h = user_factory()["headers"]
    r = _add(client, h, "   ", TODAY_S, exp_date=NEXT_YEAR)
    assert r.status_code == 400


def test_tag_name_too_long(client, user_factory):
    h = user_factory()["headers"]
    r = client.post("/api/tags", headers=h,
                    json={"name": "x" * 51, "color": "#123456"})
    assert r.status_code == 400
    r = client.post("/api/tags", headers=h,
                    json={"name": "x" * 50, "color": "#123456"})
    assert r.status_code in (200, 201), r.get_data(as_text=True)


def test_password_over_72_chars_rejected(client):
    # bcrypt truncates/rejects past 72 bytes; registration must fail
    # cleanly with a 400, not a 500 (1.0.3 fix).
    r = client.post("/api/auth/register", json={
        "username": "longpwuser", "email": "longpw@test.local",
        "password": "P" * 100, "first_name": "Long", "last_name": "Pw"})
    assert r.status_code == 400


def test_claim_document_file_type_rejected(client, user_factory,
                                           warranty_factory):
    h = user_factory()["headers"]
    wid = warranty_factory(h).get_json()["id"]
    r = client.post(f"/api/warranties/{wid}/claims", headers=h, json={
        "claim_date": TODAY_S, "status": "Submitted"})
    cid = r.get_json()["id"]
    r = client.post(f"/api/warranties/{wid}/claims/{cid}/documents",
                    headers=h,
                    data={"file": (io.BytesIO(b"MZ"), "evil.exe")},
                    content_type="multipart/form-data")
    assert r.status_code == 400
    assert r.get_json()["code"] == "file_type_not_allowed"


def test_oversized_upload_returns_json_413(client, user_factory):
    # The suite caps uploads at 1 MB (see conftest); a 2 MB photo must
    # get the JSON 413, not an HTML error page or a 500 (1.0.3 fix).
    h = user_factory()["headers"]
    big = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * (2 * 1024 * 1024))
    r = client.post("/api/warranties", headers=h,
                    data={"product_name": "BigPhoto",
                          "purchase_date": TODAY_S,
                          "exact_expiration_date": NEXT_YEAR,
                          "product_photo": (big, "big.png")},
                    content_type="multipart/form-data")
    assert r.status_code == 413
    assert r.is_json


def test_csv_import_comma_tags(client, user_factory):
    h = user_factory()["headers"]
    csv_body = (
        "ProductName,PurchaseDate,IsLifetime,WarrantyDurationYears,"
        "WarrantyDurationMonths,WarrantyDurationDays,ExpirationDate,"
        "Status,PurchasePrice,SerialNumber,ProductURL,Tags,Vendor\n"
        f'"TaggedWarranty",{TODAY_S},FALSE,1,0,0,,"",,,'
        f'"http://x.test","alpha, beta",Acme\n'
    )
    r = client.post("/api/warranties/import", headers=h,
                    data={"csv_file": (io.BytesIO(csv_body.encode()),
                                       "t.csv")},
                    content_type="multipart/form-data")
    assert r.status_code == 200, r.get_data(as_text=True)

    tags_json = client.get("/api/tags", headers=h).get_json()
    tags_list = (tags_json.get("tags", tags_json)
                 if isinstance(tags_json, dict) else tags_json)
    names = sorted(t["name"].lower() for t in tags_list)
    assert names == ["alpha", "beta"]  # two tags, not one "alpha, beta"
