"""AUTH-14: CORS must not reflect any Origin with credentials support.

The default configuration allows Bearer-token API calls from any
origin but honors no credentials cross-origin. Credentials are only
enabled for origins the operator names in CORS_ALLOWED_ORIGINS.
"""
from backend.extensions import cors_settings


def test_cors_settings_default_allows_any_origin_without_credentials(monkeypatch):
    monkeypatch.delenv('CORS_ALLOWED_ORIGINS', raising=False)
    origins, supports_credentials = cors_settings()
    assert origins == '*'
    assert supports_credentials is False


def test_cors_settings_blank_value_is_the_default(monkeypatch):
    monkeypatch.setenv('CORS_ALLOWED_ORIGINS', '  ,  ')
    origins, supports_credentials = cors_settings()
    assert origins == '*'
    assert supports_credentials is False


def test_cors_settings_named_origins_enable_credentials(monkeypatch):
    monkeypatch.setenv(
        'CORS_ALLOWED_ORIGINS',
        'https://warracker.example.com, https://app.example.com ',
    )
    origins, supports_credentials = cors_settings()
    assert origins == [
        'https://warracker.example.com',
        'https://app.example.com',
    ]
    assert supports_credentials is True


def test_cross_origin_request_gets_no_credentials_header(client):
    response = client.get(
        '/api/health', headers={'Origin': 'https://evil.example'})
    assert response.status_code == 200
    assert response.headers.get('Access-Control-Allow-Origin') == '*'
    assert response.headers.get('Access-Control-Allow-Credentials') != 'true'


def test_cross_origin_preflight_gets_no_credentials_header(client):
    response = client.options(
        '/api/health',
        headers={
            'Origin': 'https://evil.example',
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert response.headers.get('Access-Control-Allow-Origin') == '*'
    assert response.headers.get('Access-Control-Allow-Credentials') != 'true'
