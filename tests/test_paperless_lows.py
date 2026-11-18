"""Paperless Low findings: upload race (PPL-03), oracles (PPL-05),
tag scoping (PPL-06), and the page_size cap (PPL-07).
"""
import io
import types
from datetime import datetime, timedelta, UTC

import mock_paperless
import pytest

import backend.file_routes as file_routes
from backend.paperless_access import (
    claim_upload_ownership,
    get_paperless_document_owner,
)


def _user_id(db_connection, username):
    with db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()[0]


def _promote_to_admin(db_connection, username):
    """Make a user an admin regardless of registration order.

    token_required reads is_admin from the database on every request,
    so this works with the token the user already holds.
    """
    with db_connection, db_connection.cursor() as cur:
        cur.execute("UPDATE users SET is_admin = TRUE WHERE username = %s",
                    (username,))


# --- PPL-03: the uploader reclaims claims made during the upload window ---

def test_upload_claim_inserts_when_unclaimed(client, user_factory, db_connection):
    user = user_factory()
    uid = _user_id(db_connection, user["username"])
    with db_connection, db_connection.cursor() as cur:
        claim_upload_ownership(cur, 9101, uid, datetime.now(UTC))
        assert get_paperless_document_owner(cur, 9101) == uid


def test_upload_claim_keeps_older_claim(client, user_factory, db_connection):
    first = user_factory()
    second = user_factory()
    first_id = _user_id(db_connection, first["username"])
    second_id = _user_id(db_connection, second["username"])
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO paperless_document_ownership "
            "(paperless_document_id, user_id, created_at) VALUES (%s, %s, %s)",
            (9102, first_id, datetime.now(UTC) - timedelta(hours=1)),
        )
    with db_connection, db_connection.cursor() as cur:
        claim_upload_ownership(cur, 9102, second_id, datetime.now(UTC))
        assert get_paperless_document_owner(cur, 9102) == first_id


def test_upload_claim_reclaims_mid_window_claim(client, user_factory, db_connection):
    speculator = user_factory()
    uploader = user_factory()
    speculator_id = _user_id(db_connection, speculator["username"])
    uploader_id = _user_id(db_connection, uploader["username"])
    started = datetime.now(UTC) - timedelta(seconds=30)
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO paperless_document_ownership "
            "(paperless_document_id, user_id, created_at) VALUES (%s, %s, %s)",
            (9103, speculator_id, datetime.now(UTC) - timedelta(seconds=10)),
        )
    with db_connection, db_connection.cursor() as cur:
        claim_upload_ownership(cur, 9103, uploader_id, started)
        assert get_paperless_document_owner(cur, 9103) == uploader_id


# --- PPL-05: a duplicate upload must not reveal another user's document id ---

@pytest.fixture()
def duplicate_handler(monkeypatch):
    """A Paperless handler whose upload always reports a duplicate.

    The duplicate id is arbitrary (9201): the handler is faked, so no
    mock document is involved, and the id cannot collide with the
    ownership rows other tests seed.
    """
    def _fake_get_paperless_handler(conn):
        return types.SimpleNamespace(
            upload_document=lambda **kwargs: (
                False, 9201, "The file that is being uploaded to Paperless is a duplicate."),
        )
    monkeypatch.setattr(
        file_routes, "get_paperless_handler", _fake_get_paperless_handler)


def _upload_attempt(client, headers):
    return client.post(
        "/api/paperless/upload", headers=headers,
        data={"title": "dup.pdf",
              "file": (io.BytesIO(b"%PDF-1.4 test"), "dup.pdf")},
        content_type="multipart/form-data")


def test_duplicate_upload_hides_foreign_document_id(
        client, user_factory, admin_user, db_connection, duplicate_handler):
    owner = user_factory()
    stranger = user_factory()
    owner_id = _user_id(db_connection, owner["username"])
    _promote_to_admin(db_connection, admin_user["username"])
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO paperless_document_ownership (paperless_document_id, user_id) "
            "VALUES (9201, %s) ON CONFLICT (paperless_document_id) DO NOTHING",
            (owner_id,),
        )

    r = _upload_attempt(client, stranger["headers"])
    assert r.status_code == 200
    assert r.get_json()["document_id"] is None

    r = _upload_attempt(client, owner["headers"])
    assert r.get_json()["document_id"] == 9201

    r = _upload_attempt(client, admin_user["headers"])
    assert r.get_json()["document_id"] == 9201


def test_search_and_link_missing_title_matches_foreign_status(
        client, user_factory, paperless_configured, warranty_factory):
    # Both the missing-title and the foreign-document cases answer 404
    # (the foreign case is covered in test_paperless_security.py).
    user = user_factory()
    r = warranty_factory(user["headers"])
    wid = r.get_json()["id"]
    r = client.post("/api/paperless-search-and-link", headers=user["headers"],
                    json={"warranty_id": wid, "document_type": "other",
                          "search_title": "no-such-title-anywhere"})
    assert r.status_code == 404


# --- PPL-06: tags are scoped to the requesting user's visible documents ---

def test_tags_scoped_to_visible_documents(
        client, user_factory, admin_user, db_connection, paperless_configured):
    owner = user_factory()
    stranger = user_factory()
    owner_id = _user_id(db_connection, owner["username"])
    _promote_to_admin(db_connection, admin_user["username"])
    # Mock document 2 carries tag 2. (Document 1 is claimed by the
    # security battery's scenario fixture; never seed ownership for it.)
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO paperless_document_ownership (paperless_document_id, user_id) "
            "VALUES (2, %s) ON CONFLICT (paperless_document_id) DO NOTHING",
            (owner_id,),
        )

    r = client.get("/api/paperless/tags", headers=stranger["headers"])
    assert r.status_code == 200
    assert r.get_json()["results"] == []

    r = client.get("/api/paperless/tags", headers=owner["headers"])
    assert [t["id"] for t in r.get_json()["results"]] == [2]

    r = client.get("/api/paperless/tags", headers=admin_user["headers"])
    assert {t["id"] for t in r.get_json()["results"]} == {1, 2, 3}


# --- PPL-07: the forwarded page_size is capped ---

def test_search_page_size_capped_at_100(
        client, admin_user, paperless_configured, db_connection):
    _promote_to_admin(db_connection, admin_user["username"])
    mock_paperless.LAST_DOCUMENT_QUERIES.clear()
    r = client.get("/api/paperless/search",
                   query_string={"page_size": "100000"},
                   headers=admin_user["headers"])
    assert r.status_code == 200
    assert mock_paperless.LAST_DOCUMENT_QUERIES[-1]["page_size"] == ["100"]

    r = client.get("/api/paperless/search",
                   query_string={"page_size": "25"},
                   headers=admin_user["headers"])
    assert r.status_code == 200
    assert mock_paperless.LAST_DOCUMENT_QUERIES[-1]["page_size"] == ["25"]

    r = client.get("/api/paperless/search",
                   query_string={"page_size": "not-a-number"},
                   headers=admin_user["headers"])
    assert r.status_code == 200
    assert mock_paperless.LAST_DOCUMENT_QUERIES[-1]["page_size"] == ["25"]
