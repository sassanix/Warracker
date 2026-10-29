"""Local file access control — the /api/files/ authorization rules.

This is the local-files twin of the Paperless battery: the 1.0.3 IDOR
(GHSA-w3rm-8qhv-w3f5) lived here. Rules under test:

- owner and admins: every file.
- other users, with global view on (the default): product photo,
  invoice, and manual are shared by design; "other documents" and
  claim documents are NEVER shared.
- a file that does not exist on disk returns a JSON 404.
"""
import base64
import io
from types import SimpleNamespace

import pytest

PDF = b"%PDF-1.4 test document"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def files_scenario(client, user_factory, admin_user):
    ns = SimpleNamespace()
    ns.owner = user_factory()["headers"]
    ns.stranger = user_factory()["headers"]
    ns.admin = admin_user["headers"]

    r = client.post("/api/warranties", headers=ns.owner,
                    data={
                        "product_name": "Doc Widget",
                        "purchase_date": "2025-01-01",
                        "exact_expiration_date": "2027-01-01",
                        "invoice": (io.BytesIO(PDF), "inv.pdf"),
                        "manual": (io.BytesIO(PDF), "man.pdf"),
                        "other_document": (io.BytesIO(PDF), "other.pdf"),
                        "product_photo": (io.BytesIO(PNG), "photo.png"),
                    },
                    content_type="multipart/form-data")
    assert r.status_code == 201, r.get_data(as_text=True)
    ns.wid = r.get_json()["id"]

    body = client.get("/api/warranties", headers=ns.owner).get_json()
    items = body.get("warranties", body) if isinstance(body, dict) else body
    w = next(w for w in items if w["id"] == ns.wid)
    ns.paths = {k: w[k] for k in ("invoice_path", "manual_path",
                                  "other_document_path", "product_photo_path")}
    assert all(ns.paths.values()), ns.paths

    r = client.post(f"/api/warranties/{ns.wid}/claims", headers=ns.owner,
                    json={"claim_date": "2026-01-15", "status": "Submitted"})
    assert r.status_code == 201, r.get_data(as_text=True)
    cid = r.get_json()["id"]
    r = client.post(
        f"/api/warranties/{ns.wid}/claims/{cid}/documents",
        headers=ns.owner,
        data={"file": (io.BytesIO(PDF), "evidence.pdf")},
        content_type="multipart/form-data")
    assert r.status_code == 201, r.get_data(as_text=True)
    docs = client.get(
        f"/api/warranties/{ns.wid}/claims/{cid}/documents",
        headers=ns.owner).get_json()
    assert len(docs) == 1
    ns.claim_path = docs[0]["file_path"]
    return ns


def _get(client, headers, path):
    return client.get(f"/api/files/{path}", headers=headers)


def test_owner_downloads_everything(client, files_scenario):
    for path in files_scenario.paths.values():
        r = _get(client, files_scenario.owner, path)
        assert r.status_code == 200, path
    r = _get(client, files_scenario.owner, files_scenario.claim_path)
    assert r.status_code == 200


def test_stranger_gets_shared_types_only(client, files_scenario):
    # Shared by design under global view.
    for key in ("invoice_path", "manual_path", "product_photo_path"):
        r = _get(client, files_scenario.stranger, files_scenario.paths[key])
        assert r.status_code == 200, key
    # Never shared.
    r = _get(client, files_scenario.stranger,
             files_scenario.paths["other_document_path"])
    assert r.status_code == 403
    r = _get(client, files_scenario.stranger, files_scenario.claim_path)
    assert r.status_code == 403


def test_admin_downloads_everything(client, files_scenario):
    r = _get(client, files_scenario.admin,
             files_scenario.paths["other_document_path"])
    assert r.status_code == 200
    r = _get(client, files_scenario.admin, files_scenario.claim_path)
    assert r.status_code == 200


def test_missing_file_returns_json_404(client, files_scenario):
    r = _get(client, files_scenario.admin, "uploads/definitely-missing-1.pdf")
    assert r.status_code == 404
    assert r.is_json


def test_file_requires_auth(client, files_scenario):
    r = client.get(f"/api/files/{files_scenario.paths['invoice_path']}")
    assert r.status_code == 401
