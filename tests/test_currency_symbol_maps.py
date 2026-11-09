"""Issue #289: currency symbol-to-code maps omitted most supported symbols.

A user whose default currency is the Serbian Dinar (symbol дин) saw a
Total Value of 0: the symbol maps never resolved дин to RSD, so the
default fell back to USD and every RSD warranty was excluded from the
sum (the #192 rule sums only the default currency, plus rows with no
currency recorded).

The maps are now completed from the canonical supported-currency list
(the /api/currencies list in backend/warranties_routes.py): every
symbol that belongs to exactly one supported code resolves to it.
Symbols shared by several supported codes keep their established
resolution ($ -> USD, £ -> GBP, ¥ -> JPY, ₩ -> KRW, kr -> SEK); the
fully ambiguous Rs, K, and L stay unmapped, because the server stores
only the symbol and cannot tell LKR from NPR, MMK from PGK, or MDL
from ALL in this pass.
"""
import ast
import io
import os
import re

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _read(relpath):
    with open(os.path.join(REPO_ROOT, relpath), encoding="utf-8") as fh:
        return fh.read()


def _expected_map():
    """Derive the expected symbol->code map from the canonical list."""
    src = _read("backend/warranties_routes.py")
    m = re.search(r"def get_currencies.*?currencies = (\[.*?\])\s*\n", src, re.S)
    currencies = ast.literal_eval(m.group(1))
    by_symbol = {}
    for entry in currencies:
        by_symbol.setdefault(entry["symbol"], []).append(entry["code"])
    expected = {s: codes[0] for s, codes in by_symbol.items() if len(codes) == 1}
    # Established resolutions for shared symbols, unchanged by #289.
    expected.update({"$": "USD", "£": "GBP", "¥": "JPY", "₩": "KRW", "kr": "SEK"})
    return expected


def _python_map(relpath, pattern):
    return ast.literal_eval(re.search(pattern, _read(relpath), re.S).group(1))


def _js_map(relpath, pattern):
    return ast.literal_eval(re.search(pattern, _read(relpath), re.S).group(1))


def test_all_five_maps_match_canonical_list():
    expected = _expected_map()
    assert expected["дин"] == "RSD"
    maps = {
        "statistics CURRENCY_SYMBOL_TO_CODE": _python_map(
            "backend/statistics_routes.py", r"CURRENCY_SYMBOL_TO_CODE = (\{.*?\})"),
        "warranties SYMBOL_TO_CURRENCY_CODE": _python_map(
            "backend/warranties_routes.py", r"SYMBOL_TO_CURRENCY_CODE = (\{.*?\})"),
        "warranties CSV import map": _python_map(
            "backend/warranties_routes.py", r"symbol_to_currency_map = (\{.*?\})"),
        "currency.js getCurrencyCode map": _js_map(
            "frontend/js/lib/currency.js", r"const map = (\{.*?\});"),
        "script.js symbolToCurrencyMap": _js_map(
            "frontend/script.js", r"const symbolToCurrencyMap = (\{.*?\});"),
    }
    for name, mapping in maps.items():
        assert mapping == expected, (
            f"{name} differs: missing={ {k: v for k, v in expected.items() if mapping.get(k) != v} }, "
            f"extra={ {k: v for k, v in mapping.items() if k not in expected} }")
        # Fully ambiguous symbols stay unmapped by design.
        for symbol in ("Rs", "K", "L"):
            assert symbol not in mapping


def test_statistics_get_user_currency_code_resolves_din():
    from backend.statistics_routes import get_user_currency_code

    class FakeCursor:
        def __init__(self, symbol):
            self._symbol = symbol

        def execute(self, *args, **kwargs):
            pass

        def fetchone(self):
            return (self._symbol,)

    assert get_user_currency_code(FakeCursor("дин"), 1) == "RSD"
    assert get_user_currency_code(FakeCursor("$"), 1) == "USD"
    assert get_user_currency_code(FakeCursor(None), 1) == "USD"


def _set_currency_symbol(db_connection, username, symbol):
    with db_connection, db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO user_preferences (user_id, currency_symbol) VALUES (%s, %s) "
            "ON CONFLICT (user_id) DO UPDATE SET currency_symbol = EXCLUDED.currency_symbol",
            (user_id, symbol),
        )
    return user_id


def _stored_currency(db_connection, warranty_id):
    with db_connection, db_connection.cursor() as cur:
        cur.execute("SELECT currency FROM warranties WHERE id = %s", (warranty_id,))
        return cur.fetchone()[0]


def test_rsd_user_total_value_statistics_and_global(client, user_factory,
                                                    warranty_factory,
                                                    db_connection):
    user = user_factory()
    h = user["headers"]
    _set_currency_symbol(db_connection, user["username"], "дин")

    # The warranties-side resolver (create/update fallback) also returns RSD.
    from backend.warranties_routes import get_user_currency_code as wr_code
    with db_connection, db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (user["username"],))
        assert wr_code(cur.fetchone()[0]) == "RSD"

    def _global_total():
        r = client.get("/api/statistics/global", headers=h)
        assert r.status_code == 200, r.get_data(as_text=True)
        return r.get_json()["total_value"]

    global_before = _global_total()

    # No currency on the form: the create fallback stores the user's RSD.
    r = warranty_factory(h, purchase_price="100")
    assert r.status_code in (200, 201), r.get_data(as_text=True)
    assert _stored_currency(db_connection, r.get_json()["id"]) == "RSD"
    # Explicit RSD row.
    warranty_factory(h, purchase_price="200", currency="RSD")
    # Legacy NULL-currency row: counts as the user's currency (#192 rule).
    r = warranty_factory(h, purchase_price="150", currency="USD")
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE warranties SET currency = NULL WHERE id = %s",
                    (r.get_json()["id"],))
    # Foreign-currency row: excluded.
    warranty_factory(h, purchase_price="500", currency="USD")

    r = client.get("/api/statistics", headers=h)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["total_value"] == 450  # 100 + 200 + 150, not the USD 500

    # Global path resolves the same user's default the same way.
    assert _global_total() - global_before == 450


def test_csv_import_without_currency_column_stores_rsd(client, user_factory,
                                                       db_connection):
    user = user_factory()
    h = user["headers"]
    _set_currency_symbol(db_connection, user["username"], "дин")

    csv_body = (
        "ProductName,PurchaseDate,IsLifetime,WarrantyDurationYears,"
        "WarrantyDurationMonths,WarrantyDurationDays,ExpirationDate,"
        "Status,PurchasePrice,SerialNumber,ProductURL,Tags,Vendor\n"
        '"RsdImportWidget",2025-01-01,FALSE,1,0,0,,,"1200",,,,,Acme\n'
    )
    r = client.post("/api/warranties/import", headers=h,
                    data={"csv_file": (io.BytesIO(csv_body.encode()), "t.csv")},
                    content_type="multipart/form-data")
    assert r.status_code == 200, r.get_data(as_text=True)

    with db_connection, db_connection.cursor() as cur:
        cur.execute("SELECT currency FROM warranties WHERE product_name = %s",
                    ("RsdImportWidget",))
        row = cur.fetchone()
    assert row is not None
    assert row[0] == "RSD"
