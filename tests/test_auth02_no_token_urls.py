"""AUTH-02: the JWT must never travel in a document URL.

Both Paperless document open flows used to call
`/api/paperless-file/<id>?token=<jwt>`; the URL then persisted in
browser history and in the service worker Cache Storage. Both flows
now fetch with the token in the Authorization header and open a blob
URL. These pins fail if a query-string token ever comes back.
"""
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

FILES = [
    REPO / "frontend" / "script.js",
    REPO / "frontend" / "js" / "components" / "paperless.js",
]


def test_no_query_token_in_paperless_open_flows():
    for path in FILES:
        text = path.read_text()
        assert "?token=" not in text, path
        assert "paperless-file/${" in text, path
        assert "Authorization" in text, path
        assert "createObjectURL" in text, path


def test_no_token_query_anywhere_in_frontend():
    for path in REPO.rglob("frontend/**/*.js"):
        if "node_modules" in path.parts:
            continue
        assert "?token=" not in path.read_text(), path
