"""Apprise 2 notify() result handling (#256).

Apprise 2 changed notify() to return an AppriseResult object instead of
the 1.x True/False/None. The handler methods are documented to return
bool, and every caller (admin test/custom endpoints, the expiration
notification flow) reads the result by truthiness. These tests pin the
contract: handler methods return real bools, with True only when the
delivery fully succeeded, under both a result-object stub and the real
Apprise library delivering to a local endpoint.
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from backend import apprise_handler as handler_module
from backend.apprise_handler import AppriseNotificationHandler


class FakeResult:
    """Stands in for Apprise 2's AppriseResult: truthy only on success."""

    def __init__(self, ok):
        self._ok = ok

    def __bool__(self):
        return self._ok


class FakeAppriseObj:
    def __init__(self, ok):
        self._ok = ok
        self.calls = []

    def notify(self, title=None, body=None):
        self.calls.append((title, body))
        return FakeResult(self._ok)


def _handler_with(obj):
    handler = AppriseNotificationHandler.__new__(AppriseNotificationHandler)
    handler.apprise_obj = obj
    handler.enabled = True
    handler.notification_urls = ["json://example"]
    handler.title_prefix = "[Warracker]"
    handler.expiration_days = [7]
    return handler


@pytest.fixture(autouse=True)
def _apprise_available(monkeypatch):
    monkeypatch.setattr(handler_module, "APPRISE_AVAILABLE", True)


def test_test_notification_returns_real_bool():
    ok_handler = _handler_with(FakeAppriseObj(True))
    result = ok_handler.send_test_notification()
    assert result is True

    failing_handler = _handler_with(FakeAppriseObj(False))
    result = failing_handler.send_test_notification()
    assert result is False


def test_expiration_batch_returns_real_bool():
    warranties = [{"product_name": "Widget", "expiration_date": "2030-01-01"}]

    ok_handler = _handler_with(FakeAppriseObj(True))
    assert ok_handler._send_expiration_batch(warranties, 7) is True

    failing_handler = _handler_with(FakeAppriseObj(False))
    assert failing_handler._send_expiration_batch(warranties, 7) is False


def test_custom_notification_returns_real_bool():
    ok_handler = _handler_with(FakeAppriseObj(True))
    assert ok_handler.send_custom_notification("Title", "Message") is True

    failing_handler = _handler_with(FakeAppriseObj(False))
    assert failing_handler.send_custom_notification("Title", "Message") is False


class _CaptureHandler(BaseHTTPRequestHandler):
    posts = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        _CaptureHandler.posts.append(body)
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


@pytest.fixture()
def capture_server():
    _CaptureHandler.posts = []
    server = HTTPServer(("127.0.0.1", 0), _CaptureHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server.server_address[1]
    server.shutdown()


def test_real_apprise_delivery_to_local_endpoint(capture_server):
    import apprise

    apprise_obj = apprise.Apprise()
    assert apprise_obj.add(f"json://127.0.0.1:{capture_server}") is True

    handler = _handler_with(apprise_obj)
    assert handler.send_test_notification() is True

    assert len(_CaptureHandler.posts) == 1
    payload = json.loads(_CaptureHandler.posts[0])
    assert "Test Notification" in payload.get("title", "")
    assert "test notification" in payload.get("message", "").lower()


def test_real_apprise_failure_returns_false():
    import apprise

    apprise_obj = apprise.Apprise()
    # Port 1 is closed: the delivery fails and must read as False.
    assert apprise_obj.add("json://127.0.0.1:1") is True

    handler = _handler_with(apprise_obj)
    assert handler.send_test_notification() is False
