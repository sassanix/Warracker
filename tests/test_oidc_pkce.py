"""PKCE S256 support for the OIDC client (#288).

PKCE is enabled per provider: when the provider discovery document
advertises S256 in code_challenge_methods_supported, the Authlib client
is registered with code_challenge_method S256. Providers that do not
advertise S256, and providers whose discovery document cannot be read,
keep the plain authorization code flow.
"""
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from flask import Flask

from backend import oidc_handler
from backend.extensions import oauth as shared_oauth

ISSUER = "https://idp.example.com/realms/main"
METADATA_URL = ISSUER + "/.well-known/openid-configuration"


class FakeResponse:
    def __init__(self, payload, error=None):
        self._payload = payload
        self._error = error

    def raise_for_status(self):
        if self._error is not None:
            raise self._error

    def json(self):
        return self._payload


def _stub_discovery(monkeypatch, payload, error=None):
    calls = []

    def fake_get(url, timeout=None):
        calls.append((url, timeout))
        return FakeResponse(payload, error=error)

    monkeypatch.setattr(oidc_handler.requests, "get", fake_get)
    return calls


def test_pkce_supported_when_s256_advertised(monkeypatch):
    calls = _stub_discovery(
        monkeypatch, {"code_challenge_methods_supported": ["plain", "S256"]})
    assert oidc_handler._provider_supports_pkce(ISSUER + "/") is True
    assert calls == [(METADATA_URL, 5)]


def test_pkce_not_supported_with_plain_only(monkeypatch):
    _stub_discovery(monkeypatch, {"code_challenge_methods_supported": ["plain"]})
    assert oidc_handler._provider_supports_pkce(ISSUER) is False


def test_pkce_not_supported_when_methods_missing(monkeypatch):
    _stub_discovery(monkeypatch, {"issuer": ISSUER})
    assert oidc_handler._provider_supports_pkce(ISSUER) is False


def test_pkce_falls_back_when_discovery_unreachable(monkeypatch):
    def fake_get(url, timeout=None):
        raise requests.ConnectionError("no route to host")

    monkeypatch.setattr(oidc_handler.requests, "get", fake_get)
    assert oidc_handler._provider_supports_pkce(ISSUER) is False


def test_pkce_falls_back_on_http_error(monkeypatch):
    _stub_discovery(
        monkeypatch, {}, error=requests.HTTPError("404 Client Error"))
    assert oidc_handler._provider_supports_pkce(ISSUER) is False


class FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, query):
        self.query = query

    def fetchall(self):
        return self._rows


class FakeConnection:
    def __init__(self, rows):
        self._rows = rows

    def cursor(self):
        return FakeCursor(self._rows)


OIDC_ROWS = [
    ("oidc_enabled", "true"),
    ("oidc_provider_name", "testidp"),
    ("oidc_client_id", "warracker-client"),
    ("oidc_client_secret", "test-secret"),
    ("oidc_issuer_url", ISSUER),
    ("oidc_scope", "openid email profile"),
]

OIDC_ENV_VARS = (
    "OIDC_ENABLED", "OIDC_PROVIDER_NAME", "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET", "OIDC_CLIENT_SECRET_FILE", "OIDC_ISSUER_URL",
    "OIDC_SCOPE",
)


def _run_init(monkeypatch, payload):
    for var in OIDC_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    _stub_discovery(monkeypatch, payload)

    registrations = []
    monkeypatch.setattr(
        shared_oauth, "register",
        lambda **kwargs: registrations.append(kwargs))

    app = Flask(__name__)
    oidc_handler.init_oidc_client(
        app, lambda: FakeConnection(OIDC_ROWS), lambda conn: None)
    assert len(registrations) == 1
    return app, registrations[0]


def test_init_registers_s256_when_provider_advertises_it(monkeypatch):
    app, registration = _run_init(
        monkeypatch, {"code_challenge_methods_supported": ["S256"]})
    assert app.config["OIDC_ENABLED"] is True
    assert app.config["OIDC_PKCE_ENABLED"] is True
    assert registration["name"] == "testidp"
    assert registration["server_metadata_url"] == METADATA_URL
    assert registration["client_kwargs"] == {
        "scope": "openid email profile",
        "code_challenge_method": "S256",
    }


def test_init_registers_without_pkce_when_provider_lacks_s256(monkeypatch):
    app, registration = _run_init(
        monkeypatch, {"code_challenge_methods_supported": ["plain"]})
    assert app.config["OIDC_ENABLED"] is True
    assert app.config["OIDC_PKCE_ENABLED"] is False
    assert registration["client_kwargs"] == {"scope": "openid email profile"}


def test_authlib_builds_s256_challenge_for_registered_client():
    from authlib.integrations.flask_client import OAuth
    from authlib.oauth2.rfc7636 import create_s256_code_challenge

    app = Flask("pkce-authlib-test")
    app.secret_key = "pkce-test-secret"
    oauth = OAuth()
    oauth.init_app(app)
    oauth.register(
        name="pkceidp",
        client_id="warracker-client",
        client_secret="test-secret",
        authorize_url="https://idp.example.com/authorize",
        access_token_url="https://idp.example.com/token",
        client_kwargs={
            "scope": "openid email profile",
            "code_challenge_method": "S256",
        },
    )
    with app.test_request_context("/"):
        client = oauth.create_client("pkceidp")
        result = client.create_authorization_url(
            "https://warracker.example.com/api/oidc/callback")
    query = parse_qs(urlparse(result["url"]).query)
    assert query["code_challenge_method"] == ["S256"]
    assert query["code_challenge"] == [
        create_s256_code_challenge(result["code_verifier"])]
