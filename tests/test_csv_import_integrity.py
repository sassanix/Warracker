"""CSV import integrity and cost (CSV-01, CSV-03).

CSV-01: one database-error row used to abort the whole import
transaction, so the commit at the end rolled everything back while
the API still reported the rows imported before the failure. Each
row now runs under its own savepoint, so a failed row is confined
to itself and success_count is accurate.

CSV-03: duplicate suffixing restarted at (1) for every row, so a
same-name import re-checked every earlier suffix per row (O(n^2)
database checks). The search now resumes where the last row left
off, which makes it O(n) with identical renaming results.
"""
import io
import time

HEADER = (
    "ProductName,PurchaseDate,IsLifetime,WarrantyDurationYears,"
    "WarrantyDurationMonths,WarrantyDurationDays,ExpirationDate,"
    "Status,PurchasePrice,SerialNumber,ProductURL,Tags,Vendor\n"
)


def _import(client, headers, body):
    return client.post(
        "/api/warranties/import", headers=headers,
        data={"csv_file": (io.BytesIO(body.encode()), "t.csv")},
        content_type="multipart/form-data")


def _row(name, serial=""):
    return (
        f'"{name}",2025-01-01,FALSE,1,0,0,,"",,{serial},,,Acme\n'
    )


def test_bad_row_does_not_roll_back_good_rows(
        client, user_factory, db_connection):
    user = user_factory()
    body = HEADER + _row("GoodOne") + _row("BadSerial", "X" * 300) \
        + _row("GoodTwo")
    r = _import(client, user["headers"], body)
    assert r.status_code == 200, r.get_data(as_text=True)
    result = r.get_json()
    assert result["success_count"] == 2, result
    assert result["failure_count"] == 1, result
    assert result["errors"][0]["row"] == 3, result

    # The two good rows actually persisted; the bad one did not.
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT product_name FROM warranties WHERE user_id = "
            "(SELECT id FROM users WHERE username = %s)",
            (user["username"],))
        names = sorted(row[0] for row in cur.fetchall())
    assert names == ["GoodOne", "GoodTwo"]


def test_same_name_import_is_linear_time(client, user_factory, db_connection):
    user = user_factory()
    rows = "".join(_row("SameWidget") for _ in range(500))
    started = time.monotonic()
    r = _import(client, user["headers"], HEADER + rows)
    elapsed = time.monotonic() - started
    assert r.status_code == 200, r.get_data(as_text=True)
    result = r.get_json()
    assert result["success_count"] == 500, result
    assert result["failure_count"] == 0, result
    # The pre-fix quadratic scan needed over a minute for 500 rows;
    # the linear scan finishes in seconds even on a slow runner.
    assert elapsed < 30, elapsed

    # Every row got a distinct suffixed name.
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT COUNT(DISTINCT product_name) FROM warranties "
            "WHERE user_id = (SELECT id FROM users WHERE username = %s)",
            (user["username"],))
        assert cur.fetchone()[0] == 500
