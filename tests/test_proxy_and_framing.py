"""Framing protection (CFG-07a) and forwarded-header trust (CFG-11).

CFG-07a: every response carries X-Frame-Options so the app never
renders framed by another origin.

CFG-11: with the app directly exposed, a spoofed X-Forwarded-For was
stored as the login IP because ProxyFix trusted every peer. Forwarded
headers are now honored only from loopback, private, or link-local
peers (the shipped nginx and LAN proxy shapes); other peers have them
stripped before ProxyFix sees them.
"""
import pytest

from backend import _forwarded_headers_trusted


def test_frame_options_header_on_api_response(client):
    r = client.get("/api/health")
    assert r.headers.get("X-Frame-Options") == "SAMEORIGIN"


@pytest.mark.parametrize("addr,trusted", [
    ("127.0.0.1", True),
    ("::1", True),
    ("10.1.2.3", True),
    ("172.16.0.5", True),
    ("192.168.1.1", True),
    ("169.254.1.1", True),
    ("203.0.113.5", False),
    ("8.8.8.8", False),
    ("", False),
    ("not-an-ip", False),
])
def test_forwarded_headers_trust_matrix(monkeypatch, addr, trusted):
    monkeypatch.delenv("TRUST_PROXY_HEADERS", raising=False)
    assert _forwarded_headers_trusted(addr) is trusted


def test_trust_proxy_headers_override(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
    assert _forwarded_headers_trusted("8.8.8.8") is True
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "false")
    assert _forwarded_headers_trusted("127.0.0.1") is False


def _latest_session_ip(db_connection, username):
    with db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        user_id = cur.fetchone()[0]
        cur.execute(
            "SELECT ip_address FROM user_sessions WHERE user_id = %s "
            "ORDER BY id DESC LIMIT 1",
            (user_id,),
        )
        return cur.fetchone()[0]


def test_spoofed_forwarded_for_ignored_from_public_peer(
        client, user_factory, db_connection):
    user = user_factory()
    r = client.post(
        "/api/auth/login",
        json={"username": user["username"], "password": "TestPass123!"},
        headers={"X-Forwarded-For": "198.51.100.77"},
        environ_base={"REMOTE_ADDR": "203.0.113.5"},
    )
    assert r.status_code == 200
    assert _latest_session_ip(db_connection, user["username"]) == "203.0.113.5"


def test_forwarded_for_honored_from_loopback_peer(
        client, user_factory, db_connection):
    user = user_factory()
    r = client.post(
        "/api/auth/login",
        json={"username": user["username"], "password": "TestPass123!"},
        headers={"X-Forwarded-For": "198.51.100.77"},
        environ_base={"REMOTE_ADDR": "127.0.0.1"},
    )
    assert r.status_code == 200
    assert _latest_session_ip(db_connection, user["username"]) == "198.51.100.77"
