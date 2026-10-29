"""Self-contained mock of the Paperless-ngx REST API surface Warracker uses.

Implements: document list/search, post_document upload, task polling,
document info/preview/download/thumb. NOT a real Paperless instance.
Used only by the test suite (tests/test_paperless_security.py).
"""
import base64
import json
import re
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PDF_BYTES = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
# 1x1 transparent PNG
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)

DOCS = [
    {"id": 1, "title": "Invoice - Laptop 2026", "created": "2026-01-20T10:00:00Z",
     "mime_type": "application/pdf", "archived_file_name": "invoice-laptop.pdf"},
    {"id": 2, "title": "Manual - Headphones", "created": "2026-06-05T10:00:00Z",
     "mime_type": "application/pdf", "archived_file_name": "manual-headphones.pdf"},
]
TASKS = {}  # task_id -> doc_id
NEXT_ID = [3]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _bytes(self, data, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        path, qs = u.path, parse_qs(u.query)

        if path == "/api/documents/":
            docs = DOCS
            # checksum dedup lookup: mock docs have no checksums -> no match
            if "checksum__iexact" in qs:
                docs = []
            q = qs.get("query", [""])[0].lower()
            if q:
                docs = [d for d in DOCS if q in d["title"].lower()]
            ti = qs.get("title__icontains", [""])[0].lower()
            if ti:
                docs = [d for d in docs if ti in d["title"].lower()]
            page_size = int(qs.get("page_size", ["25"])[0])
            docs = docs[:page_size]
            return self._json({"count": len(docs), "next": None, "previous": None, "results": docs})

        m = re.match(r"^/api/documents/(\d+)/$", path)
        if m:
            doc = next((d for d in DOCS if d["id"] == int(m.group(1))), None)
            return self._json(doc if doc else {"detail": "Not found"},
                              status=200 if doc else 404)

        m = re.match(r"^/api/documents/(\d+)/(preview|download)/$", path)
        if m:
            return self._bytes(PDF_BYTES, "application/pdf")

        m = re.match(r"^/api/documents/(\d+)/thumb/$", path)
        if m:
            return self._bytes(PNG_BYTES, "image/png")

        m = re.match(r"^/api/tasks/([0-9a-f-]+)/$", path)
        if m:
            tid = m.group(1)
            if tid in TASKS:
                return self._json({"id": tid, "state": "SUCCESS",
                                   "result": f"document id {TASKS[tid]}"})
            return self._json({"detail": "Not found"}, status=404)

        if path == "/api/tasks/":
            tid = qs.get("task_id", [""])[0]
            if tid in TASKS:
                return self._json([{"id": tid, "state": "SUCCESS",
                                    "result": f"document id {TASKS[tid]}"}])
            return self._json([])

        if path == "/api/tags/":
            return self._json({"count": 2, "next": None, "previous": None,
                               "results": [{"id": 1, "name": "invoice"},
                                           {"id": 2, "name": "manual"}]})

        self._json({"detail": "not found"}, status=404)

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/api/documents/post_document/":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            # extract filename from multipart
            m = re.search(rb'filename="([^"]+)"', body)
            fname = m.group(1).decode(errors="replace") if m else "upload.pdf"
            # Real Paperless-ngx honors the submitted 'title' form field
            mt = re.search(rb'name="title"\r\n\r\n([^\r\n]+)', body)
            title = mt.group(1).decode(errors="replace") if mt else fname
            doc_id = NEXT_ID[0]
            NEXT_ID[0] += 1
            DOCS.append({"id": doc_id, "title": title,
                         "created": "2026-09-30T10:00:00Z",
                         "mime_type": "application/pdf",
                         "archived_file_name": fname})
            task_id = str(uuid.uuid4())
            TASKS[task_id] = doc_id
            # Return task UUID as plain text (like real Paperless-ngx),
            # toggleable to JSON string via ?json=1 for branch testing
            if parse_qs(urlparse(self.path).query).get("json"):
                return self._json(task_id)
            body = task_id.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self._json({"detail": "not found"}, status=404)


def create_server():
    """Start the mock on an ephemeral localhost port; returns (server, url)."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    return server, f"http://127.0.0.1:{server.server_address[1]}"
