"""Product photo by URL (#207).

The server downloads the image once and stores it like an upload. The
SSRF guard rejects non-public hosts; the suite sets
ALLOW_PRIVATE_PHOTO_URLS so it can use a local throwaway server, and
one test turns the guard back on to prove it bites.
"""
import base64
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/photo.png":
            body, ctype = PNG_BYTES, "image/png"
        elif self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "/photo.png")
            self.end_headers()
            return
        else:
            body, ctype = b"<html>not an image</html>", "text/html"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def image_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture()
def private_urls_allowed(app):
    app.config["ALLOW_PRIVATE_PHOTO_URLS"] = True
    yield
    app.config["ALLOW_PRIVATE_PHOTO_URLS"] = False


def _photo_path(client, headers, wid):
    r = client.get("/api/warranties", headers=headers)
    items = r.get_json()
    if isinstance(items, dict):
        items = items.get("warranties", [])
    for w in items:
        if w["id"] == wid:
            return w.get("product_photo_path")
    return None


def test_create_with_photo_url(client, user_factory, warranty_factory,
                               image_server, private_urls_allowed):
    user = user_factory()
    r = warranty_factory(user["headers"],
                         product_photo_url=f"{image_server}/photo.png")
    assert r.status_code == 201, r.get_data(as_text=True)
    path = _photo_path(client, user["headers"], r.get_json()["id"])
    assert path and path.endswith(".png"), path
    on_disk = os.path.join(os.environ["UPLOAD_FOLDER"], os.path.basename(path))
    assert os.path.exists(on_disk)


def test_photo_url_follows_redirect(client, user_factory, warranty_factory,
                                    image_server, private_urls_allowed):
    user = user_factory()
    r = warranty_factory(user["headers"],
                         product_photo_url=f"{image_server}/redirect")
    assert r.status_code == 201, r.get_data(as_text=True)
    assert _photo_path(client, user["headers"], r.get_json()["id"])


def test_photo_url_rejects_non_image(client, user_factory, warranty_factory,
                                     image_server, private_urls_allowed):
    user = user_factory()
    r = warranty_factory(user["headers"],
                         product_photo_url=f"{image_server}/page.html")
    assert r.status_code == 400
    assert "image" in r.get_json()["error"].lower()


def test_photo_url_blocks_private_hosts(client, user_factory,
                                        warranty_factory, image_server, app):
    app.config["ALLOW_PRIVATE_PHOTO_URLS"] = False
    user = user_factory()
    r = warranty_factory(user["headers"],
                         product_photo_url=f"{image_server}/photo.png")
    assert r.status_code == 400
    assert "public" in r.get_json()["error"].lower()


def test_uploaded_file_wins_over_url(client, user_factory, warranty_factory,
                                     image_server, private_urls_allowed):
    import io
    user = user_factory()
    r = warranty_factory(
        user["headers"],
        product_photo_url=f"{image_server}/page.html",
        product_photo=(io.BytesIO(PNG_BYTES), "shot.png"),
    )
    assert r.status_code == 201, r.get_data(as_text=True)
    assert _photo_path(client, user["headers"], r.get_json()["id"])


def test_update_with_photo_url(client, user_factory, warranty_factory,
                               image_server, private_urls_allowed):
    user = user_factory()
    h = user["headers"]
    r = warranty_factory(h)
    assert r.status_code == 201
    wid = r.get_json()["id"]
    r = client.put(f"/api/warranties/{wid}", headers=h, data={
        "product_name": "Widget",
        "purchase_date": "2025-01-01",
        "exact_expiration_date": "2027-01-01",
        "product_photo_url": f"{image_server}/photo.png",
    })
    assert r.status_code == 200, r.get_data(as_text=True)
    assert _photo_path(client, h, wid)


# --- SSRF-02: translation addresses must not smuggle private IPv4s ---

def test_nat64_embedded_private_is_not_public():
    from backend.warranties_routes import _ip_address_is_public
    import ipaddress
    # The NAT64 well-known prefix embedding the cloud metadata address:
    # is_global reports True for it, the guard must not.
    assert not _ip_address_is_public(
        ipaddress.ip_address("64:ff9b::a9fe:a9fe"))
    # The whole prefix is rejected, even embedding a public IPv4.
    assert not _ip_address_is_public(
        ipaddress.ip_address("64:ff9b::808:808"))


def test_translation_addresses_judged_by_embedded_ipv4():
    from backend.warranties_routes import _ip_address_is_public
    import ipaddress
    assert not _ip_address_is_public(
        ipaddress.ip_address("::ffff:10.0.0.1"))
    assert _ip_address_is_public(ipaddress.ip_address("::ffff:8.8.8.8"))
    # 6to4 and Teredo wrappers stay rejected (as before); a wrapper
    # embedding a private IPv4 is rejected on the embedded check too.
    assert not _ip_address_is_public(
        ipaddress.ip_address("2002:0a00:0001::"))
    assert not _ip_address_is_public(
        ipaddress.ip_address("2001:0000:4136:e378:8000:63bf:f5ff:fffe"))


def test_plain_addresses_unchanged():
    from backend.warranties_routes import _ip_address_is_public
    import ipaddress
    assert _ip_address_is_public(ipaddress.ip_address("8.8.8.8"))
    assert not _ip_address_is_public(ipaddress.ip_address("10.0.0.1"))
    assert not _ip_address_is_public(ipaddress.ip_address("127.0.0.1"))
    assert not _ip_address_is_public(ipaddress.ip_address("169.254.169.254"))
    assert _ip_address_is_public(
        ipaddress.ip_address("2001:4860:4860::8888"))


def test_guard_rejects_host_resolving_to_nat64(monkeypatch, app):
    """End to end through the resolver: a hostname whose only address is
    a NAT64-embedded private IPv4 is refused by the photo fetch."""
    import socket
    from backend.warranties_routes import download_product_photo
    real_getaddrinfo = socket.getaddrinfo

    def _fake_getaddrinfo(host, port, *args, **kwargs):
        if host == "nat64.example.invalid":
            return [(socket.AF_INET6, socket.SOCK_STREAM, 0, "",
                     ("64:ff9b::a9fe:a9fe", 0, 0, 0))]
        return real_getaddrinfo(host, port, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo)
    app.config["ALLOW_PRIVATE_PHOTO_URLS"] = False
    with app.app_context():
        with pytest.raises(ValueError, match="public address"):
            download_product_photo("http://nat64.example.invalid/photo.png")


# --- SSRF-03: the fetch has a total deadline, not just a per-read timeout ---

class _DripHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.end_headers()
        try:
            for _ in range(100):
                self.wfile.write(b"\x89")
                self.wfile.flush()
                import time as _time
                _time.sleep(0.3)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *args):
        pass


def test_slow_drip_fetch_times_out(app):
    import time
    from backend.warranties_routes import download_product_photo
    server = ThreadingHTTPServer(("127.0.0.1", 0), _DripHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    previous_timeout = app.config.get("PHOTO_FETCH_TIMEOUT_SECONDS")
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/drip.png"
        app.config["ALLOW_PRIVATE_PHOTO_URLS"] = True
        app.config["PHOTO_FETCH_TIMEOUT_SECONDS"] = 1
        start = time.monotonic()
        with app.app_context():
            with pytest.raises(ValueError, match="Timed out"):
                download_product_photo(url)
        assert time.monotonic() - start < 10
    finally:
        if previous_timeout is None:
            app.config.pop("PHOTO_FETCH_TIMEOUT_SECONDS", None)
        else:
            app.config["PHOTO_FETCH_TIMEOUT_SECONDS"] = previous_timeout
        app.config["ALLOW_PRIVATE_PHOTO_URLS"] = False
        server.shutdown()


def test_photo_fetch_timeout_env_var(monkeypatch):
    from flask import Flask
    from backend.config import Config

    monkeypatch.delenv("PHOTO_FETCH_TIMEOUT_SECONDS", raising=False)
    assert Config._get_photo_fetch_timeout_seconds() == 60

    monkeypatch.setenv("PHOTO_FETCH_TIMEOUT_SECONDS", "15")
    assert Config._get_photo_fetch_timeout_seconds() == 15.0

    monkeypatch.setenv("PHOTO_FETCH_TIMEOUT_SECONDS", "2.5")
    assert Config._get_photo_fetch_timeout_seconds() == 2.5

    for invalid in ("", "   ", "0", "-5", "abc", "nan", "inf", "-inf"):
        monkeypatch.setenv("PHOTO_FETCH_TIMEOUT_SECONDS", invalid)
        assert Config._get_photo_fetch_timeout_seconds() == 60, invalid

    monkeypatch.setenv("PHOTO_FETCH_TIMEOUT_SECONDS", "12")
    probe_app = Flask(__name__)
    probe_app.config["TESTING"] = True
    Config.init_app(probe_app)
    assert probe_app.config["PHOTO_FETCH_TIMEOUT_SECONDS"] == 12.0


def test_photo_fetch_timeout_env_var_enforced_end_to_end(monkeypatch):
    import time
    from flask import Flask
    from backend.config import Config
    from backend.warranties_routes import download_product_photo

    monkeypatch.setenv("PHOTO_FETCH_TIMEOUT_SECONDS", "1")
    probe_app = Flask(__name__)
    probe_app.config["TESTING"] = True
    Config.init_app(probe_app)
    probe_app.config["ALLOW_PRIVATE_PHOTO_URLS"] = True

    server = ThreadingHTTPServer(("127.0.0.1", 0), _DripHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/drip.png"
        start = time.monotonic()
        with probe_app.app_context():
            with pytest.raises(ValueError, match="Timed out"):
                download_product_photo(url)
        assert time.monotonic() - start < 10
    finally:
        server.shutdown()
