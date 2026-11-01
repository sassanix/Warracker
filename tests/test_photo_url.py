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
