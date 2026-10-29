"""Statistics rules: void status (#250) and Total Value currency (#192).

- A voided warranty drops out of Total Value and the active/expired/
  expiring counts, and appears in the voided count; unvoid restores it.
- Total Value sums only the user's own currency; warranties with no
  currency recorded (legacy rows, imports without a currency column)
  count as the user's currency, foreign-currency rows do not.
"""


def _stats(client, headers):
    r = client.get("/api/statistics", headers=headers)
    assert r.status_code == 200, r.get_data(as_text=True)
    return r.get_json()


def test_void_excluded_from_counts_and_value(client, user_factory,
                                             warranty_factory):
    h = user_factory()["headers"]
    warranty_factory(h, purchase_price="100")
    r = warranty_factory(h, purchase_price="200")
    wid_b = r.get_json()["id"]

    st = _stats(client, h)
    assert st["total_value"] == 300
    assert st["active"] == 2
    assert st["voided"] == 0

    r = client.patch(f"/api/warranties/{wid_b}/void", headers=h,
                     json={"voided": True})
    assert r.status_code == 200, r.get_data(as_text=True)

    st = _stats(client, h)
    assert st["total_value"] == 100
    assert st["active"] == 1
    assert st["voided"] == 1

    r = client.patch(f"/api/warranties/{wid_b}/void", headers=h,
                     json={"voided": False})
    assert r.status_code == 200, r.get_data(as_text=True)

    st = _stats(client, h)
    assert st["total_value"] == 300
    assert st["active"] == 2
    assert st["voided"] == 0


def test_total_value_currency_rules(client, user_factory, warranty_factory,
                                    db_connection):
    h = user_factory()["headers"]
    # No currency recorded on the form -> counts toward the total.
    warranty_factory(h, purchase_price="100")
    # Foreign currency -> excluded from the user's Total Value.
    warranty_factory(h, purchase_price="500", currency="EUR")
    # Legacy-style row: currency explicitly NULL in the database ->
    # counts as the user's currency (this was the undercount bug).
    r = warranty_factory(h, purchase_price="150", currency="EUR")
    wid_null = r.get_json()["id"]
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE warranties SET currency = NULL WHERE id = %s",
                    (wid_null,))

    st = _stats(client, h)
    assert st["total_value"] == 250  # 100 (no currency) + 150 (NULL), not 500
