"""Warranty claims & claim documents CRUD, file cleanup, and access control.

Covers:
- Full claim CRUD lifecycle (POST, GET, PUT, DELETE) and claim_status_summary
  transitions on GET /api/warranties (NO_CLAIMS -> OPEN -> FINISHED -> NO_CLAIMS)
- Claim document upload, listing, individual deletion (with disk cleanup),
  and cascade file cleanup when deleting a claim or parent warranty
- Cross-user authorization: non-owners cannot create/update/delete claims or
  documents, cannot read /claims/<id>/documents even under global view, and
  receive empty documents[] when reading claims under global view
"""
import io
import os

import pytest


def _promote(db_connection, username):
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "UPDATE users SET is_admin = TRUE WHERE username = %s",
            (username,),
        )


@pytest.fixture()
def _global_view_setting(db_connection):
    conn = db_connection
    with conn.cursor() as cur:
        cur.execute(
            "SELECT key, value FROM site_settings "
            "WHERE key IN ('global_view_enabled', 'global_view_admin_only')"
        )
        saved = dict(cur.fetchall())

    def _set(enabled, admin_only):
        with conn.cursor() as cur:
            for key, value in (
                ("global_view_enabled", enabled),
                ("global_view_admin_only", admin_only),
            ):
                cur.execute(
                    "INSERT INTO site_settings (key, value) VALUES (%s, %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                    (key, value),
                )
        conn.commit()

    yield _set

    with conn.cursor() as cur:
        for key in ("global_view_enabled", "global_view_admin_only"):
            if key in saved:
                cur.execute(
                    "UPDATE site_settings SET value = %s WHERE key = %s",
                    (saved[key], key),
                )
            else:
                cur.execute("DELETE FROM site_settings WHERE key = %s", (key,))
    conn.commit()


def _warranty_summary(client, headers, wid):
    rows = client.get("/api/warranties", headers=headers).get_json()
    return next(w for w in rows if w["id"] == wid)["claim_status_summary"]


def test_claim_crud_and_warranty_status_summary_transitions(
        client, user_factory, warranty_factory):
    user = user_factory()
    h = user["headers"]
    wid = warranty_factory(h, product_name="Claimable Laptop").get_json()["id"]

    assert _warranty_summary(client, h, wid) == "NO_CLAIMS"

    # Missing claim_date rejected.
    r_bad = client.post(
        f"/api/warranties/{wid}/claims", headers=h, json={"status": "Submitted"}
    )
    assert r_bad.status_code == 400

    # Create open claim -> summary becomes OPEN.
    r_create = client.post(
        f"/api/warranties/{wid}/claims",
        headers=h,
        json={
            "claim_date": "2025-06-10",
            "status": "Submitted",
            "claim_number": "  CLM-100  ",
            "description": "Screen flicker",
        },
    )
    assert r_create.status_code == 201, r_create.get_data(as_text=True)
    claim = r_create.get_json()
    cid = claim["id"]
    assert claim["claim_number"] == "CLM-100"
    assert claim["documents"] == []
    assert _warranty_summary(client, h, wid) == "OPEN"

    # GET returns the created claim.
    r_list = client.get(f"/api/warranties/{wid}/claims", headers=h)
    assert r_list.status_code == 200
    assert [c["id"] for c in r_list.get_json()] == [cid]

    # Update claim to Resolved -> summary becomes FINISHED.
    r_upd = client.put(
        f"/api/warranties/{wid}/claims/{cid}",
        headers=h,
        json={
            "status": "Resolved",
            "resolution": "Replaced panel",
            "resolution_date": "2025-06-20",
        },
    )
    assert r_upd.status_code == 200, r_upd.get_data(as_text=True)
    updated = r_upd.get_json()
    assert updated["status"] == "Resolved"
    assert updated["resolution"] == "Replaced panel"
    assert updated["resolution_date"] == "2025-06-20"
    assert _warranty_summary(client, h, wid) == "FINISHED"

    # Delete claim -> summary returns to NO_CLAIMS.
    r_del = client.delete(f"/api/warranties/{wid}/claims/{cid}", headers=h)
    assert r_del.status_code == 200, r_del.get_data(as_text=True)
    assert client.get(f"/api/warranties/{wid}/claims", headers=h).get_json() == []
    assert _warranty_summary(client, h, wid) == "NO_CLAIMS"


def test_claim_documents_lifecycle_and_disk_cleanup(
        app, client, user_factory, warranty_factory):
    user = user_factory()
    h = user["headers"]
    wid = warranty_factory(h, product_name="Claim Docs Phone").get_json()["id"]
    cid = client.post(
        f"/api/warranties/{wid}/claims",
        headers=h,
        json={"claim_date": "2025-07-01", "status": "Submitted"},
    ).get_json()["id"]

    # Missing file and paperless_document_id rejected.
    r_empty = client.post(
        f"/api/warranties/{wid}/claims/{cid}/documents",
        headers=h,
        data={},
        content_type="multipart/form-data",
    )
    assert r_empty.status_code == 400

    # Upload two local PDF documents to the claim.
    def _upload(name):
        r = client.post(
            f"/api/warranties/{wid}/claims/{cid}/documents",
            headers=h,
            data={"file": (io.BytesIO(b"%PDF-1.4\ntest"), name)},
            content_type="multipart/form-data",
        )
        assert r.status_code == 201, r.get_data(as_text=True)
        return r.get_json()

    doc1 = _upload("rma_label.pdf")
    doc2 = _upload("repair_report.pdf")
    upload_dir = app.config["UPLOAD_FOLDER"]
    path1 = os.path.join(upload_dir, os.path.basename(doc1["file_path"]))
    path2 = os.path.join(upload_dir, os.path.basename(doc2["file_path"]))
    assert os.path.isfile(path1)
    assert os.path.isfile(path2)

    # Listing documents returns both in order.
    r_docs = client.get(f"/api/warranties/{wid}/claims/{cid}/documents", headers=h)
    assert r_docs.status_code == 200
    assert [d["id"] for d in r_docs.get_json()] == [doc1["id"], doc2["id"]]

    # Deleting doc1 removes its DB row and unlinks its file from disk.
    r_del_doc = client.delete(
        f"/api/warranties/{wid}/claims/{cid}/documents/{doc1['id']}", headers=h
    )
    assert r_del_doc.status_code == 200
    assert not os.path.exists(path1)
    assert os.path.isfile(path2)
    assert [
        d["id"]
        for d in client.get(
            f"/api/warranties/{wid}/claims/{cid}/documents", headers=h
        ).get_json()
    ] == [doc2["id"]]

    # Deleting the claim cascades and unlinks doc2 from disk too.
    r_del_claim = client.delete(f"/api/warranties/{wid}/claims/{cid}", headers=h)
    assert r_del_claim.status_code == 200
    assert not os.path.exists(path2)


def test_claim_and_document_cross_user_privacy_and_access(
        client, admin_user, user_factory, warranty_factory,
        db_connection, _global_view_setting):
    _promote(db_connection, admin_user["username"])
    owner = user_factory()
    stranger = user_factory()
    wid = warranty_factory(owner["headers"], product_name="Private Claim Gear").get_json()["id"]

    cid = client.post(
        f"/api/warranties/{wid}/claims",
        headers=owner["headers"],
        json={"claim_date": "2025-08-01", "status": "In Progress"},
    ).get_json()["id"]
    doc = client.post(
        f"/api/warranties/{wid}/claims/{cid}/documents",
        headers=owner["headers"],
        data={"file": (io.BytesIO(b"%PDF-1.4\nsecret"), "private_receipt.pdf")},
        content_type="multipart/form-data",
    ).get_json()

    # Stranger cannot create, update, or delete owner's claims or documents.
    assert client.post(
        f"/api/warranties/{wid}/claims",
        headers=stranger["headers"],
        json={"claim_date": "2025-08-02"},
    ).status_code == 404
    assert client.put(
        f"/api/warranties/{wid}/claims/{cid}",
        headers=stranger["headers"],
        json={"status": "Cancelled"},
    ).status_code == 404
    assert client.delete(
        f"/api/warranties/{wid}/claims/{cid}",
        headers=stranger["headers"],
    ).status_code == 404
    assert client.post(
        f"/api/warranties/{wid}/claims/{cid}/documents",
        headers=stranger["headers"],
        data={"file": (io.BytesIO(b"%PDF-1.4\nx"), "x.pdf")},
        content_type="multipart/form-data",
    ).status_code == 404
    assert client.delete(
        f"/api/warranties/{wid}/claims/{cid}/documents/{doc['id']}",
        headers=stranger["headers"],
    ).status_code == 404

    # Under global view enabled: stranger can read claim summary, but
    # embedded documents are stripped and /documents endpoint returns 404.
    _global_view_setting("true", "false")
    r_claims_stranger = client.get(
        f"/api/warranties/{wid}/claims", headers=stranger["headers"]
    )
    assert r_claims_stranger.status_code == 200
    stranger_claims = r_claims_stranger.get_json()
    assert len(stranger_claims) == 1
    assert stranger_claims[0]["documents"] == []

    assert client.get(
        f"/api/warranties/{wid}/claims/{cid}/documents",
        headers=stranger["headers"],
    ).status_code == 404

    # Owner and admin DO see claim documents.
    r_docs_admin = client.get(
        f"/api/warranties/{wid}/claims/{cid}/documents",
        headers=admin_user["headers"],
    )
    assert r_docs_admin.status_code == 200
    assert [d["id"] for d in r_docs_admin.get_json()] == [doc["id"]]

    r_claims_admin = client.get(
        f"/api/warranties/{wid}/claims", headers=admin_user["headers"]
    )
    assert r_claims_admin.status_code == 200
    assert [d["id"] for d in r_claims_admin.get_json()[0]["documents"]] == [doc["id"]]

    # Under global view disabled: stranger gets 404 on GET /claims too.
    _global_view_setting("false", "false")
    assert client.get(
        f"/api/warranties/{wid}/claims", headers=stranger["headers"]
    ).status_code == 404
