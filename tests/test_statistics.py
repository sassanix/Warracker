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


def test_statistics_payloads_include_owner_user_id(
        client, user_factory, warranty_factory):
    alice = user_factory()
    bob = user_factory()

    w_alice = warranty_factory(alice["headers"], product_name="Alice Item").get_json()["id"]
    w_bob = warranty_factory(bob["headers"], product_name="Bob Item").get_json()["id"]

    me_alice = client.get("/api/auth/user", headers=alice["headers"]).get_json()
    me_bob = client.get("/api/auth/user", headers=bob["headers"]).get_json()
    alice_id = me_alice["user"]["id"] if "user" in me_alice else me_alice["id"]
    bob_id = me_bob["user"]["id"] if "user" in me_bob else me_bob["id"]

    personal = _stats(client, alice["headers"])
    by_id = {w["id"]: w for w in personal["all_warranties"]}
    assert by_id[w_alice]["user_id"] == alice_id

    r_global = client.get("/api/statistics/global", headers=bob["headers"])
    assert r_global.status_code == 200, r_global.get_data(as_text=True)
    global_by_id = {w["id"]: w for w in r_global.get_json()["all_warranties"]}
    assert global_by_id[w_alice]["user_id"] == alice_id
    assert global_by_id[w_bob]["user_id"] == bob_id
