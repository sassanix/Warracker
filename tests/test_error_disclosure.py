"""Error responses must not disclose internal detail (CFG-10).

A Paperless connection failure used to reach the client verbatim,
carrying the internal host, port, API path, and query shape. The full
error is still logged server-side; the client gets a generic message.
"""
import types

import pytest
import requests

import backend.file_routes as file_routes


@pytest.fixture()
def failing_paperless(monkeypatch):
    """A Paperless handler whose requests fail with a URL-bearing error."""
    def _boom(*args, **kwargs):
        raise requests.exceptions.ConnectionError(
            "HTTPConnectionPool(host='internal.paperless.local', port=8000): "
            "Max retries exceeded with url: /api/documents/?query=secret"
        )

    handler = types.SimpleNamespace(base_url="http://internal.paperless.local:8000", get=_boom)
    monkeypatch.setattr(
        file_routes, "get_paperless_handler", lambda conn: handler)
    return handler


def _assert_no_internal_detail(response):
    body = response.get_data(as_text=True)
    for leaked in ("internal.paperless.local", "8000", "api/documents", "HTTPConnectionPool"):
        assert leaked not in body, body


def test_paperless_search_failure_hides_internal_detail(
        client, user_factory, failing_paperless):
    user = user_factory()
    r = client.get("/api/paperless/search?query=secret", headers=user["headers"])
    assert r.status_code == 400
    _assert_no_internal_detail(r)
    assert "Paperless-ngx search failed" in r.get_json()["message"]


def test_paperless_tags_failure_hides_internal_detail(
        client, user_factory, failing_paperless):
    user = user_factory()
    r = client.get("/api/paperless/tags", headers=user["headers"])
    assert r.status_code == 400
    _assert_no_internal_detail(r)
    assert "Paperless-ngx tags failed" in r.get_json()["message"]


def test_paperless_auth_failure_keeps_friendly_message(
        client, user_factory, monkeypatch):
    """A 401/403 from Paperless still tells the user it is credentials."""
    def _denied(*args, **kwargs):
        response = requests.Response()
        response.status_code = 403
        error = requests.exceptions.HTTPError("403 Forbidden")
        error.response = response
        raise error

    handler = types.SimpleNamespace(base_url="http://internal:8000", get=_denied)
    monkeypatch.setattr(
        file_routes, "get_paperless_handler", lambda conn: handler)
    user = user_factory()
    r = client.get("/api/paperless/search", headers=user["headers"])
    assert r.status_code == 400
    assert "rejected the credentials" in r.get_json()["message"]
    assert "internal" not in r.get_data(as_text=True)
