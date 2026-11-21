"""CSV-04: explicit allow-list of unambiguous date formats.

Only ISO YYYY-MM-DD and named-month dates are accepted, in the CSV
importer (PurchaseDate, ExpirationDate) and the claim endpoints
(claim_date, resolution_date). Ambiguous numeric dates such as
03/04/2024 are rejected with a clear error naming the accepted
formats, instead of being silently parsed month-first.
"""
import io
from datetime import date

import pytest

from backend.warranties_routes import parse_unambiguous_date

HEADER = (
    "ProductName,PurchaseDate,IsLifetime,WarrantyDurationYears,"
    "WarrantyDurationMonths,WarrantyDurationDays,ExpirationDate,"
    "Status,PurchasePrice,SerialNumber,ProductURL,Tags,Vendor\n"
)


def test_accepted_formats():
    assert parse_unambiguous_date("2024-03-15") == date(2024, 3, 15)
    assert parse_unambiguous_date("15 Mar 2024") == date(2024, 3, 15)
    assert parse_unambiguous_date("15 March 2024") == date(2024, 3, 15)
    assert parse_unambiguous_date("Mar 15, 2024") == date(2024, 3, 15)
    assert parse_unambiguous_date("March 15, 2024") == date(2024, 3, 15)
    assert parse_unambiguous_date("15 Mar, 2024") == date(2024, 3, 15)
    assert parse_unambiguous_date("15 March, 2024") == date(2024, 3, 15)
    assert parse_unambiguous_date("Mar 15 2024") == date(2024, 3, 15)
    assert parse_unambiguous_date("March 15 2024") == date(2024, 3, 15)
    assert parse_unambiguous_date("5 Mar 2024") == date(2024, 3, 5)
    assert parse_unambiguous_date("15 mar 2024") == date(2024, 3, 15)
    assert parse_unambiguous_date(" 2024-03-15 ") == date(2024, 3, 15)


def test_date_objects_pass_through():
    assert parse_unambiguous_date(date(2024, 3, 15)) == date(2024, 3, 15)


def test_ambiguous_and_unsupported_dates_rejected():
    for bad in ("03/04/2024", "04/03/2024", "2024/03/15", "15.03.2024",
                "2024-13-01", "2024-02-30", "March 3 2026x", "", "not a date"):
        with pytest.raises(ValueError, match="YYYY-MM-DD"):
            parse_unambiguous_date(bad)


def _import(client, headers, body):
    return client.post(
        "/api/warranties/import", headers=headers,
        data={"csv_file": (io.BytesIO(body.encode()), "t.csv")},
        content_type="multipart/form-data")


def _row(name, purchase_date, expiration_date="", duration_years=1):
    # 13 fields in header order. A row with an explicit expiration date
    # needs zero duration, or the importer calculates the expiration
    # from the duration and ignores the provided date.
    return (f'"{name}",{purchase_date},FALSE,{duration_years},0,0,'
            f'{expiration_date},"",,,,,,Acme\n')


def test_csv_import_accepts_named_month_dates(client, user_factory):
    user = user_factory()
    body = HEADER + _row("NamedMonth", "15 Mar 2024")
    r = _import(client, user["headers"], body)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["success_count"] == 1, r.get_json()


def test_csv_import_accepts_named_month_expiration(
        client, user_factory, db_connection):
    user = user_factory()
    body = HEADER + _row("NamedExpiry", "2024-01-01", '"March 15, 2024"',
                         duration_years=0)
    r = _import(client, user["headers"], body)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["success_count"] == 1, r.get_json()
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT expiration_date FROM warranties WHERE product_name = %s",
            ("NamedExpiry",))
        assert cur.fetchone()[0] == date(2024, 3, 15)


def test_csv_import_rejects_ambiguous_numeric_date(client, user_factory):
    user = user_factory()
    body = HEADER + _row("Ambiguous", "03/04/2024")
    r = _import(client, user["headers"], body)
    # Every row failed, so the endpoint answers 400; the row error
    # itself must name the accepted formats.
    assert r.status_code == 400, r.get_data(as_text=True)
    result = r.get_json()
    assert result["errors"][0]["errors"][0].startswith(
        "Invalid PurchaseDate format."), result
    assert "YYYY-MM-DD" in result["errors"][0]["errors"][0], result


def _claim(client, headers, wid, claim_date, resolution_date=None):
    body = {"claim_date": claim_date, "status": "Submitted"}
    if resolution_date is not None:
        body["resolution_date"] = resolution_date
    return client.post(f"/api/warranties/{wid}/claims",
                       headers=headers, json=body)


def test_claim_dates_use_the_same_allow_list(
        client, user_factory, warranty_factory):
    h = user_factory()["headers"]
    wid = warranty_factory(h).get_json()["id"]

    r = _claim(client, h, wid, "03/04/2024")
    assert r.status_code == 400
    assert "YYYY-MM-DD" in r.get_json()["error"]

    r = _claim(client, h, wid, "15 Mar 2024",
               resolution_date="04/05/2024")
    assert r.status_code == 400
    assert "YYYY-MM-DD" in r.get_json()["error"]

    r = _claim(client, h, wid, "March 15, 2024",
               resolution_date="15 Mar 2024")
    assert r.status_code == 201, r.get_data(as_text=True)
    cid = r.get_json()["id"]

    r = client.put(f"/api/warranties/{wid}/claims/{cid}", headers=h,
                   json={"claim_date": "03/04/2024"})
    assert r.status_code == 400
    assert "YYYY-MM-DD" in r.get_json()["error"]

    r = client.put(f"/api/warranties/{wid}/claims/{cid}", headers=h,
                   json={"claim_date": "15 March 2024"})
    assert r.status_code == 200, r.get_data(as_text=True)

    r = client.put(f"/api/warranties/{wid}/claims/{cid}", headers=h,
                   json={"claim_date": "March 15 2024",
                         "resolution_date": "15 March, 2024"})
    assert r.status_code == 200, r.get_data(as_text=True)


def test_csv_import_accepts_full_month_commaless_and_day_comma_dates(
        client, user_factory, db_connection):
    user = user_factory()
    body = (
        HEADER
        + _row("CommalessFullMonth", "March 15 2024", '"15 March, 2026"',
               duration_years=0)
    )
    r = _import(client, user["headers"], body)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["success_count"] == 1, r.get_json()
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT purchase_date, expiration_date FROM warranties "
            "WHERE product_name = %s",
            ("CommalessFullMonth",))
        assert cur.fetchone() == (date(2024, 3, 15), date(2026, 3, 15))
