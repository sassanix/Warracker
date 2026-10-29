"""Paperless-ngx access-control battery.

Ported from the QA security script test_paperless_security.py (27
checks), written for GHSA-fv62-3hrm-gf83 and GHSA-3h89-rqfj-5674 plus
the claim-documents extension. Runs against a mock Paperless server
(tests/mock_paperless.py) with three actors: an admin, a document
owner (user A), and an attacker (user B).

Global view is ON (the default): invoice/manual documents stay
viewable across users by design, but linking, claim documents, and
document metadata must never cross accounts.

The module-scoped `scenario` fixture performs the successful-path
setup in order; the tests then run the blocked/allowed assertions.
"""
import io
from types import SimpleNamespace

import pytest


def _upload(client, headers, title):
    r = client.post(
        "/api/paperless/upload", headers=headers,
        data={"title": title,
              "file": (io.BytesIO(b"%PDF-1.4 test document"), "doc.pdf")},
        content_type="multipart/form-data")
    body = r.get_json()
    assert body and body.get("success"), f"upload failed: {body}"
    return body["document_id"]


def _search_ids(client, headers):
    r = client.get("/api/paperless/search", headers=headers,
                   query_string={"query": ""})
    return [d["id"] for d in r.get_json().get("results", [])]


@pytest.fixture(scope="module")
def scenario(client, admin_user, user_factory, warranty_factory,
             paperless_configured):
    ns = SimpleNamespace()
    ns.admin = admin_user["headers"]
    ns.a = user_factory()["headers"]
    ns.b = user_factory()["headers"]

    # Admin uploads a private document.
    ns.d_admin = _upload(client, ns.admin, "ADMIN-SECRET-INVOICE")

    # User A uploads a document and links it to their own warranty.
    ns.d_a = _upload(client, ns.a, "A-Invoice-Doc")
    r = warranty_factory(ns.a, paperless_invoice_id=str(ns.d_a))
    assert r.status_code == 201, r.get_data(as_text=True)
    ns.wid_a = r.get_json()["id"]

    # Attacker's own plain warranty (target for blocked link attempts).
    r = warranty_factory(ns.b)
    assert r.status_code == 201, r.get_data(as_text=True)
    ns.wid_b = r.get_json()["id"]

    # A search-and-links their own manual document.
    ns.d_a3 = _upload(client, ns.a, "A-Manual-Doc")
    r = client.post("/api/paperless-search-and-link", headers=ns.a, json={
        "warranty_id": ns.wid_a, "document_type": "manual",
        "search_title": "A-Manual-Doc"})
    assert r.status_code == 200, r.get_data(as_text=True)

    # A's claim with A's own Paperless claim document.
    r = client.post(f"/api/warranties/{ns.wid_a}/claims", headers=ns.a,
                    json={"claim_date": "2026-02-01", "status": "Submitted",
                          "description": "A claim"})
    assert r.status_code == 201, r.get_data(as_text=True)
    ns.cid_a = r.get_json()["id"]
    ns.d_a2 = _upload(client, ns.a, "A-Claim-Evidence")
    r = client.post(
        f"/api/warranties/{ns.wid_a}/claims/{ns.cid_a}/documents",
        headers=ns.a, data={"paperless_document_id": str(ns.d_a2)})
    assert r.status_code == 201, r.get_data(as_text=True)

    # First-linker claims the unowned mock document id 1.
    r = warranty_factory(ns.a, paperless_invoice_id="1")
    assert r.status_code == 201, r.get_data(as_text=True)

    return ns


# --- Attacker battery: every route to the admin's document must fail ---

def test_attacker_search_excludes_admin_doc(client, scenario):
    assert scenario.d_admin not in _search_ids(client, scenario.b)


def test_attacker_direct_download_blocked(client, scenario):
    r = client.get(f"/api/paperless-file/{scenario.d_admin}",
                   headers=scenario.b)
    assert r.status_code in (403, 404)


def test_attacker_create_warranty_link_blocked(client, scenario,
                                               warranty_factory):
    r = warranty_factory(scenario.b,
                         paperless_invoice_id=str(scenario.d_admin))
    assert r.status_code == 403


def test_attacker_search_and_link_blocked(client, scenario):
    r = client.post("/api/paperless-search-and-link", headers=scenario.b,
                    json={"warranty_id": scenario.wid_b,
                          "document_type": "other",
                          "search_title": "ADMIN-SECRET-INVOICE"})
    assert r.status_code == 403


def test_attacker_update_warranty_link_blocked(client, scenario):
    r = client.put(f"/api/warranties/{scenario.wid_b}", headers=scenario.b,
                   data={"product_name": "Widget",
                         "purchase_date": "2025-01-01",
                         "exact_expiration_date": "2027-01-01",
                         "paperless_other_id": str(scenario.d_admin)})
    assert r.status_code == 403


def test_attacker_debug_endpoints_blocked(client, scenario):
    r = client.get(f"/api/paperless/debug-document/{scenario.d_admin}",
                   headers=scenario.b)
    assert r.status_code == 403
    r = client.get("/api/paperless/debug", headers=scenario.b)
    assert r.status_code == 403


def test_attacker_claim_document_link_blocked(client, scenario):
    r = client.post(f"/api/warranties/{scenario.wid_b}/claims",
                    headers=scenario.b,
                    json={"claim_date": "2026-01-10", "status": "Submitted",
                          "description": "attacker claim"})
    cid_b = r.get_json()["id"]
    r = client.post(
        f"/api/warranties/{scenario.wid_b}/claims/{cid_b}/documents",
        headers=scenario.b,
        data={"paperless_document_id": str(scenario.d_admin)})
    assert r.status_code == 403


# --- Legitimate owner flows ----------------------------------------------

def test_owner_search_scoping(client, scenario):
    assert scenario.d_a in _search_ids(client, scenario.a)
    assert scenario.d_a not in _search_ids(client, scenario.b)


def test_owner_download_works(client, scenario):
    r = client.get(f"/api/paperless-file/{scenario.d_a}",
                   headers=scenario.a)
    assert r.status_code == 200


def test_global_view_shares_viewing_not_linking(client, scenario,
                                                warranty_factory):
    # Invoice-type documents stay viewable across users by design...
    r = client.get(f"/api/paperless-file/{scenario.d_a}",
                   headers=scenario.b)
    assert r.status_code == 200
    # ...but linking someone else's document is always blocked.
    r = warranty_factory(scenario.b,
                         paperless_invoice_id=str(scenario.d_a))
    assert r.status_code == 403


def test_claim_document_privacy(client, scenario):
    r = client.get(
        f"/api/warranties/{scenario.wid_a}/claims/{scenario.cid_a}/documents",
        headers=scenario.a)
    assert r.status_code == 200 and len(r.get_json()) == 1

    r = client.get(
        f"/api/warranties/{scenario.wid_a}/claims/{scenario.cid_a}/documents",
        headers=scenario.b)
    assert r.status_code == 404

    # Claim metadata embedded in the claims list: documents only for owner.
    r = client.get(f"/api/warranties/{scenario.wid_a}/claims",
                   headers=scenario.b)
    assert all(len(c.get("documents") or []) == 0 for c in r.get_json())
    r = client.get(f"/api/warranties/{scenario.wid_a}/claims",
                   headers=scenario.a)
    assert any(len(c.get("documents") or []) == 1 for c in r.get_json())

    # The claim document file itself never crosses accounts.
    r = client.get(f"/api/paperless-file/{scenario.d_a2}",
                   headers=scenario.b)
    assert r.status_code in (403, 404)


def test_first_linker_claims_unowned_document(client, scenario,
                                              warranty_factory):
    # scenario setup: user A already claimed mock document 1.
    r = warranty_factory(scenario.b, paperless_invoice_id="1")
    assert r.status_code == 403


def test_admin_keeps_full_access(client, scenario):
    ids = _search_ids(client, scenario.admin)
    assert scenario.d_admin in ids and scenario.d_a in ids
    r = client.get(f"/api/paperless-file/{scenario.d_a}",
                   headers=scenario.admin)
    assert r.status_code == 200
    r = client.get(f"/api/paperless/debug-document/{scenario.d_admin}",
                   headers=scenario.admin)
    assert r.status_code == 200


def test_unknown_document_404(client, scenario):
    r = client.get("/api/paperless-file/99999", headers=scenario.a)
    assert r.status_code == 404
