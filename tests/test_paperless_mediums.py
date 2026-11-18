"""Paperless Medium-Low findings: search leakage (PPL-01) and
cleanup on outage (PPL-04).

PPL-01: the upstream search response carries an `all` array (IDs of
every matching document instance-wide) and a `previous` URL (with
the internal Paperless host). Both used to reach non-admin users
whose own filtered result set was empty.

PPL-04: cleanup treated any Paperless error as "document gone", so
an outage unlinked live references. The handler now distinguishes
exists / gone / unknown, and cleanup only unlinks on 'gone'.
"""
import types

import pytest

import backend.file_routes as file_routes
from backend.paperless_handler import PaperlessHandler


def _user_id(db_connection, username):
    with db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()[0]


def _promote_to_admin(db_connection, username):
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE users SET is_admin = TRUE WHERE username = %s",
                    (username,))


# --- PPL-01: non-admins must not receive `all` or `previous` ---

class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


@pytest.fixture()
def leaky_search_handler(monkeypatch):
    """A Paperless handler whose search response carries `all` and
    `previous`, as the real Paperless-ngx does. The document ids are
    in the 93xx range so no ownership row here can collide with the
    security battery's mock-document claims or the Low batch's 91xx
    upload-claim ids."""
    payload = {
        "count": 4,
        "next": "http://paperless.internal:8000/api/documents/?page=3",
        "previous": "http://paperless.internal:8000/api/documents/?page=1",
        "all": [9301, 9302, 9303, 9304],
        "results": [
            {"id": 9301, "title": "Invoice - Laptop 2026"},
            {"id": 9302, "title": "Manual - Headphones"},
        ],
    }
    handler = types.SimpleNamespace(
        base_url="http://paperless.internal:8000",
        get=lambda *a, **k: _FakeResponse(payload),
    )
    monkeypatch.setattr(
        file_routes, "get_paperless_handler", lambda conn: handler)


def test_search_strips_all_and_previous_for_non_admin(
        client, admin_user, user_factory, leaky_search_handler):
    user = user_factory()
    r = client.get("/api/paperless/search", headers=user["headers"])
    assert r.status_code == 200
    body = r.get_json()
    assert body["results"] == []
    assert body["count"] == 0
    assert "all" not in body
    assert body["previous"] is None
    assert body["next"] is None


def test_search_strips_all_and_previous_for_visible_docs(
        client, admin_user, user_factory, db_connection, leaky_search_handler):
    owner = user_factory()
    owner_id = _user_id(db_connection, owner["username"])
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO paperless_document_ownership (paperless_document_id, user_id) "
            "VALUES (9302, %s) ON CONFLICT (paperless_document_id) DO NOTHING",
            (owner_id,),
        )
    r = client.get("/api/paperless/search", headers=owner["headers"])
    assert r.status_code == 200
    body = r.get_json()
    assert [d["id"] for d in body["results"]] == [9302]
    assert "all" not in body
    assert body["previous"] is None


def test_search_keeps_all_and_previous_for_admin(
        client, admin_user, db_connection, leaky_search_handler):
    _promote_to_admin(db_connection, admin_user["username"])
    r = client.get("/api/paperless/search", headers=admin_user["headers"])
    assert r.status_code == 200
    body = r.get_json()
    assert body["all"] == [9301, 9302, 9303, 9304]
    assert body["previous"].startswith("http://paperless.internal:8000")


# --- PPL-04: the handler distinguishes gone from unreachable ---

class _StatusResponse:
    def __init__(self, status_code):
        self.status_code = status_code


def _handler_with_get(get_fn):
    handler = PaperlessHandler("http://paperless.internal:8000", "tok")
    handler.get = get_fn
    return handler


def test_document_existence_tri_state():
    assert _handler_with_get(
        lambda *a, **k: _StatusResponse(200)).document_existence(7) == 'exists'
    assert _handler_with_get(
        lambda *a, **k: _StatusResponse(404)).document_existence(7) == 'gone'
    assert _handler_with_get(
        lambda *a, **k: _StatusResponse(500)).document_existence(7) == 'unknown'
    def _refused(*a, **k):
        raise ConnectionError("connection refused")
    assert _handler_with_get(_refused).document_existence(7) == 'unknown'
    assert _handler_with_get(
        lambda *a, **k: _StatusResponse(200)).document_exists(7) is True
    assert _handler_with_get(
        lambda *a, **k: _StatusResponse(500)).document_exists(7) is False


# --- PPL-04: cleanup skips unreachable documents, unlinks gone ones ---

@pytest.fixture()
def existence_handler(monkeypatch, request):
    """Stub handler whose document_existence returns the parametrized
    value for any document id."""
    outcome = request.param
    handler = types.SimpleNamespace(
        document_existence=lambda doc_id: outcome,
        document_exists=lambda doc_id: outcome == 'exists',
    )
    monkeypatch.setattr(
        file_routes, "get_paperless_handler", lambda conn: handler)


def _warranty_with_paperless_ref(client, user_factory, db_connection):
    user = user_factory()
    r = client.post("/api/warranties", headers=user["headers"],
                    data={"product_name": "PplRef", "purchase_date": "2025-01-01",
                          "exact_expiration_date": "2026-01-01"},
                    content_type="multipart/form-data")
    wid = r.get_json()["id"]
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "UPDATE warranties SET paperless_invoice_id = 9999 WHERE id = %s",
            (wid,))
    return user, wid


def _paperless_ref(db_connection, wid):
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT paperless_invoice_id FROM warranties WHERE id = %s",
            (wid,))
        return cur.fetchone()[0]


@pytest.mark.parametrize("existence_handler", ['unknown'], indirect=True)
def test_cleanup_skips_unreachable_document(
        client, admin_user, user_factory, db_connection, existence_handler):
    user, wid = _warranty_with_paperless_ref(
        client, user_factory, db_connection)
    r = client.post("/api/paperless/cleanup-invalid", headers=user["headers"])
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    assert body["details"]["skipped"] == 1
    assert body["details"]["cleaned_up"] == 0
    assert "unreachable" in body["message"]
    assert _paperless_ref(db_connection, wid) == 9999


@pytest.mark.parametrize("existence_handler", ['gone'], indirect=True)
def test_cleanup_unlinks_gone_document(
        client, admin_user, user_factory, db_connection, existence_handler):
    user, wid = _warranty_with_paperless_ref(
        client, user_factory, db_connection)
    r = client.post("/api/paperless/cleanup-invalid", headers=user["headers"])
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    assert body["details"]["skipped"] == 0
    assert body["details"]["cleaned_up"] == 1
    assert _paperless_ref(db_connection, wid) is None
