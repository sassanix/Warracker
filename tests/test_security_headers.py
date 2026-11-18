"""CFG-07b / CFG-07d: every response Flask serves carries a
Content-Security-Policy and a Referrer-Policy header.

The policy must keep the app's own third-party calls working: the
Buy Me a Coffee button script on the About page and the version
checker's fetch of api.github.com. nginx.conf repeats the same
headers for the pages nginx serves directly, and the values must
stay identical to the Flask constant.
"""
import re
from pathlib import Path

from backend import _CONTENT_SECURITY_POLICY

NGINX_CONF = Path(__file__).parent.parent / "nginx.conf"


def test_csp_and_referrer_policy_on_api_response(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers.get("Content-Security-Policy") == _CONTENT_SECURITY_POLICY
    assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_csp_and_referrer_policy_on_error_response(client):
    r = client.get("/api/no-such-endpoint")
    assert r.status_code == 404
    assert r.headers.get("Content-Security-Policy") == _CONTENT_SECURITY_POLICY
    assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_nginx_conf_repeats_the_same_csp_and_referrer_policy():
    text = NGINX_CONF.read_text()
    csp_values = re.findall(
        r'add_header Content-Security-Policy "(.*)" always;', text)
    assert len(csp_values) == 2
    assert all(value == _CONTENT_SECURITY_POLICY for value in csp_values)
    referrer_values = re.findall(
        r'add_header Referrer-Policy "(.*)" always;', text)
    assert len(referrer_values) == 2
    assert all(
        value == "strict-origin-when-cross-origin"
        for value in referrer_values)


def test_csp_keeps_inline_scripts_and_styles_working():
    assert "script-src 'self' 'unsafe-inline'" in _CONTENT_SECURITY_POLICY
    assert "style-src 'self' 'unsafe-inline'" in _CONTENT_SECURITY_POLICY


def test_csp_allows_the_about_page_widget_and_version_check():
    assert "https://cdnjs.buymeacoffee.com" in _CONTENT_SECURITY_POLICY
    assert "https://*.buymeacoffee.com" in _CONTENT_SECURITY_POLICY
    assert "https://api.github.com" in _CONTENT_SECURITY_POLICY


def test_csp_blocks_plugins_and_foreign_framing():
    assert "object-src 'none'" in _CONTENT_SECURITY_POLICY
    assert "frame-ancestors 'self'" in _CONTENT_SECURITY_POLICY
    assert "base-uri 'self'" in _CONTENT_SECURITY_POLICY
    assert "form-action 'self'" in _CONTENT_SECURITY_POLICY
