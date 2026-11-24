"""Paperless-ngx API v10 (Paperless-ngx 3.x) task polling (#298).

The v9 poll shapes (plain task object, bare list, upper-case state,
related_document, result text) must keep working, and the v10 shapes
(paginated list page, lower-case status, related_document_ids,
result_data) must resolve the document id instead of looping to the
10-minute deadline and returning None.
"""
import io
import types

import mock_paperless
import pytest

import backend.file_routes as file_routes
from backend.paperless_handler import PaperlessHandler, _task_payload
from backend.paperless_access import get_paperless_document_owner

TASK_ID = "123e4567-e89b-12d3-a456-426614174000"


class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.url = ""

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


def _stub_get(handler, primary, task_list):
    """Point handler.get at canned task responses.

    primary is (status, body) for GET /api/tasks/<uuid>/, task_list is
    the body for GET /api/tasks/?task_id=<uuid>. Either may be a list
    of bodies served in order, to model a task that finishes later.
    """
    calls = {"primary": 0, "list": 0}

    def _pick(spec, count):
        if isinstance(spec, list):
            return spec[min(count, len(spec) - 1)]
        return spec

    def _get(url_or_path, **kwargs):
        if url_or_path.rstrip("/").endswith("/api/tasks"):
            body = _pick(task_list, calls["list"])
            calls["list"] += 1
            return _FakeResponse(200, body)
        status, body = _pick(primary, calls["primary"])
        calls["primary"] += 1
        return _FakeResponse(status, body)

    handler.get = _get
    return calls


def _handler():
    return PaperlessHandler("http://127.0.0.1:9", "test-token")


# --- _task_payload: response shape normalization ---

def test_task_payload_unwraps_v10_page():
    page = {"count": 1, "next": None, "previous": None,
            "results": [{"id": 7, "status": "success"}]}
    assert _task_payload(page) == {"id": 7, "status": "success"}
    assert _task_payload({"count": 0, "results": []}) == {}
    assert _task_payload([{"id": 7, "state": "SUCCESS"}]) == {"id": 7, "state": "SUCCESS"}
    assert _task_payload([]) == {}
    assert _task_payload({"id": 7, "state": "SUCCESS"}) == {"id": 7, "state": "SUCCESS"}
    assert _task_payload(None) == {}


# --- _get_document_id_from_task: v10 and v9 shapes ---

def test_v10_poll_resolves_document_id():
    handler = _handler()
    calls = _stub_get(handler,
                      primary=(404, {"detail": "Not found"}),
                      task_list={"count": 1, "next": None, "previous": None,
                                 "results": [{"id": 7, "task_id": TASK_ID,
                                              "status": "success",
                                              "related_document_ids": [416],
                                              "result_data": ""}]})
    assert handler._get_document_id_from_task(
        TASK_ID, timeout_secs=5, poll_interval=0.01) == 416
    assert calls["primary"] == 1
    assert calls["list"] == 1


def test_v10_poll_reads_result_data_fallback():
    handler = _handler()
    _stub_get(handler,
              primary=(404, {"detail": "Not found"}),
              task_list={"count": 1, "next": None, "previous": None,
                         "results": [{"id": 7, "task_id": TASK_ID,
                                      "status": "success",
                                      "related_document_ids": [],
                                      "result_data": "Success. New document id 417 created"}]})
    assert handler._get_document_id_from_task(
        TASK_ID, timeout_secs=5, poll_interval=0.01) == 417


def test_v10_poll_takes_first_related_document_id():
    handler = _handler()
    _stub_get(handler,
              primary=(404, {"detail": "Not found"}),
              task_list={"count": 1, "next": None, "previous": None,
                         "results": [{"id": 7, "task_id": TASK_ID,
                                      "status": "SUCCESS",
                                      "related_document_ids": [418, 419]}]})
    assert handler._get_document_id_from_task(
        TASK_ID, timeout_secs=5, poll_interval=0.01) == 418


def test_v10_poll_failure_state_returns_none_quickly():
    handler = _handler()
    _stub_get(handler,
              primary=(404, {"detail": "Not found"}),
              task_list={"count": 1, "next": None, "previous": None,
                         "results": [{"id": 7, "task_id": TASK_ID,
                                      "status": "failure",
                                      "related_document_ids": []}]})
    assert handler._get_document_id_from_task(
        TASK_ID, timeout_secs=5, poll_interval=0.01) is None


def test_v10_empty_page_keeps_polling_then_times_out():
    handler = _handler()
    calls = _stub_get(handler,
                      primary=(404, {"detail": "Not found"}),
                      task_list={"count": 0, "next": None,
                                 "previous": None, "results": []})
    assert handler._get_document_id_from_task(
        TASK_ID, timeout_secs=0.05, poll_interval=0.01) is None
    assert calls["list"] > 1


def test_v10_running_then_success():
    handler = _handler()
    running = {"count": 1, "next": None, "previous": None,
               "results": [{"id": 7, "task_id": TASK_ID,
                            "status": "running", "related_document_ids": []}]}
    done = {"count": 1, "next": None, "previous": None,
            "results": [{"id": 7, "task_id": TASK_ID,
                         "status": "success", "related_document_ids": [420]}]}
    _stub_get(handler,
              primary=(404, {"detail": "Not found"}),
              task_list=[running, done])
    assert handler._get_document_id_from_task(
        TASK_ID, timeout_secs=5, poll_interval=0.01) == 420


def test_v9_detail_poll_still_works():
    handler = _handler()
    _stub_get(handler,
              primary=(200, {"id": TASK_ID, "state": "SUCCESS",
                             "related_document": 421,
                             "result": f"document id 421"}),
              task_list=[])
    assert handler._get_document_id_from_task(
        TASK_ID, timeout_secs=5, poll_interval=0.01) == 421


def test_v9_list_poll_still_works():
    handler = _handler()
    _stub_get(handler,
              primary=(404, {"detail": "Not found"}),
              task_list=[{"id": TASK_ID, "state": "SUCCESS",
                          "related_document": 422}])
    assert handler._get_document_id_from_task(
        TASK_ID, timeout_secs=5, poll_interval=0.01) == 422


def test_v9_result_text_fallback_still_works():
    handler = _handler()
    _stub_get(handler,
              primary=(200, {"id": TASK_ID, "state": "SUCCESS",
                             "result": "Success. New document id 423 created"}),
              task_list=[])
    assert handler._get_document_id_from_task(
        TASK_ID, timeout_secs=5, poll_interval=0.01) == 423


# --- End to end against the mock server in v10 mode ---

@pytest.fixture()
def v10_mock(monkeypatch):
    """Serve v10 task shapes from the mock, then restore v9."""
    monkeypatch.setattr(mock_paperless, "TASKS_V10", True)
    yield
    monkeypatch.setattr(mock_paperless, "TASKS_V10", False)


def test_upload_resolves_document_id_against_v10_mock(paperless_url, v10_mock):
    handler = PaperlessHandler(paperless_url, "test-token")
    success, document_id, _message = handler.upload_document(
        file_content=b"%PDF-1.4 v10 test",
        filename="v10.pdf",
        title="v10 upload",
    )
    assert success is True
    assert isinstance(document_id, int) and document_id > 0


def test_upload_resolves_document_id_against_v9_mock(paperless_url):
    handler = PaperlessHandler(paperless_url, "test-token")
    success, document_id, _message = handler.upload_document(
        file_content=b"%PDF-1.4 v9 test",
        filename="v9.pdf",
        title="v9 upload",
    )
    assert success is True
    assert isinstance(document_id, int) and document_id > 0


# --- The upload route must not hold a DB connection across the poll ---

def test_paperless_upload_releases_connection_before_poll(
        client, user_factory, db_connection, monkeypatch):
    user = user_factory()
    checked_out = {"count": 0}

    from backend.db_handler import get_db_connection as real_get
    from backend.db_handler import release_db_connection as real_release

    def counting_get():
        conn = real_get()
        checked_out["count"] += 1
        return conn

    def counting_release(conn):
        real_release(conn)
        checked_out["count"] -= 1

    monkeypatch.setattr(file_routes, "get_db_connection", counting_get)
    monkeypatch.setattr(file_routes, "release_db_connection", counting_release)

    def _fake_upload_document(**kwargs):
        assert checked_out["count"] == 0, (
            "paperless upload polled while a DB connection was held")
        return True, 9401, "ok"

    def _fake_get_paperless_handler(conn):
        assert checked_out["count"] == 1
        return types.SimpleNamespace(upload_document=_fake_upload_document)

    monkeypatch.setattr(
        file_routes, "get_paperless_handler", _fake_get_paperless_handler)

    r = client.post(
        "/api/paperless/upload", headers=user["headers"],
        data={"title": "conn.pdf",
              "file": (io.BytesIO(b"%PDF-1.4 test"), "conn.pdf")},
        content_type="multipart/form-data")
    assert r.status_code == 200
    body = r.get_json()
    assert body["success"] is True
    assert body["document_id"] == 9401
    assert checked_out["count"] == 0

    with db_connection.cursor() as cur:
        assert get_paperless_document_owner(cur, 9401) is not None
