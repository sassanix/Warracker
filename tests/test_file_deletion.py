"""File deletion honors the configured upload folder (FILE-05) and never
orphans a second row sharing the same stored path (FILE-06).

FILE-05: deletion joined the hard-coded /data prefix, so deployments
with a non-default UPLOAD_FOLDER (including this suite's temp dir)
stopped deleting bytes on warranty deletion.

FILE-06: two rows sharing one stored path (legacy or restored data)
lost the file for both when one row replaced or deleted it.
"""
import io
import os

import pytest

PDF = b"%PDF-1.4 test document"
PDF2 = b"%PDF-1.4 replacement document"


def _upload_dir():
    return os.environ["UPLOAD_FOLDER"]


def _disk_path(stored_path):
    name = stored_path[8:] if stored_path.startswith("uploads/") else stored_path
    return os.path.join(_upload_dir(), name)


def _make_warranty(client, headers, invoice_bytes=PDF):
    r = client.post("/api/warranties", headers=headers, data={
        "product_name": "File Widget",
        "purchase_date": "2025-01-01",
        "exact_expiration_date": "2027-01-01",
        "invoice": (io.BytesIO(invoice_bytes), "inv.pdf"),
    }, content_type="multipart/form-data")
    assert r.status_code == 201, r.get_data(as_text=True)
    return r.get_json()["id"]


def _invoice_path(client, headers, warranty_id):
    body = client.get("/api/warranties", headers=headers).get_json()
    items = body.get("warranties", body) if isinstance(body, dict) else body
    return next(w for w in items if w["id"] == warranty_id)["invoice_path"]


@pytest.fixture()
def owner(client, user_factory):
    return user_factory()["headers"]


def test_delete_warranty_removes_bytes_from_configured_folder(
        client, owner):
    wid = _make_warranty(client, owner)
    stored = _invoice_path(client, owner, wid)
    assert os.path.isfile(_disk_path(stored))

    r = client.delete(f"/api/warranties/{wid}", headers=owner)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert not os.path.exists(_disk_path(stored))


def test_replace_keeps_bytes_shared_with_another_warranty(
        client, owner, db_connection):
    wid_a = _make_warranty(client, owner)
    wid_b = _make_warranty(client, owner)
    shared = _invoice_path(client, owner, wid_a)
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE warranties SET invoice_path = %s WHERE id = %s",
                    (shared, wid_b))

    # Replace the invoice on A only.
    r = client.put(f"/api/warranties/{wid_a}", headers=owner, data={
        "product_name": "File Widget",
        "purchase_date": "2025-01-01",
        "exact_expiration_date": "2027-01-01",
        "invoice": (io.BytesIO(PDF2), "new.pdf"),
    }, content_type="multipart/form-data")
    assert r.status_code == 200, r.get_data(as_text=True)

    # B still downloads the shared bytes; A serves its replacement.
    r = client.get(f"/api/files/{shared}", headers=owner)
    assert r.status_code == 200
    assert r.get_data() == PDF
    assert _invoice_path(client, owner, wid_a) != shared


def test_delete_keeps_bytes_shared_with_another_warranty(
        client, owner, db_connection):
    wid_a = _make_warranty(client, owner)
    wid_b = _make_warranty(client, owner)
    shared = _invoice_path(client, owner, wid_a)
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE warranties SET invoice_path = %s WHERE id = %s",
                    (shared, wid_b))

    r = client.delete(f"/api/warranties/{wid_a}", headers=owner)
    assert r.status_code == 200
    assert os.path.isfile(_disk_path(shared))
    r = client.get(f"/api/files/{shared}", headers=owner)
    assert r.status_code == 200

    # Deleting the last referencing row removes the bytes.
    r = client.delete(f"/api/warranties/{wid_b}", headers=owner)
    assert r.status_code == 200
    assert not os.path.exists(_disk_path(shared))


def test_replace_keeps_bytes_shared_with_another_column(
        client, owner, db_connection):
    wid = _make_warranty(client, owner)
    shared = _invoice_path(client, owner, wid)
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE warranties SET manual_path = %s WHERE id = %s",
                    (shared, wid))

    r = client.put(f"/api/warranties/{wid}", headers=owner, data={
        "product_name": "File Widget",
        "purchase_date": "2025-01-01",
        "exact_expiration_date": "2027-01-01",
        "invoice": (io.BytesIO(PDF2), "new.pdf"),
    }, content_type="multipart/form-data")
    assert r.status_code == 200, r.get_data(as_text=True)
    assert os.path.isfile(_disk_path(shared))
