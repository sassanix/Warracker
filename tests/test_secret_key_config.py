"""SECRET_KEY generation, persistence, and fail-closed behavior.

CFG-02: a generated key must survive container recreation, so it is
persisted inside the uploads folder (the one directory every shipped
topology mounts as a volume), with the legacy working-directory file
kept as a fallback and migrated forward.

CFG-03: when no key can be generated or persisted, startup must fail
with a clear message. There is no fallback to a publicly known key.

CFG-01c: the session cookie gains the Secure flag when the deployment
serves HTTPS, without breaking plain-HTTP installs.
"""
import os

import pytest
from flask import Flask

from backend.config import (
    DevelopmentConfig,
    ProductionConfig,
    get_try_create_secret,
)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LITERAL_FALLBACK = "your_default_secret_key_please_change_in_prod"


def test_env_secret_key_wins(monkeypatch, tmp_path):
    monkeypatch.setenv("SECRET_KEY", "env-key-value")
    monkeypatch.setenv("UPLOAD_FOLDER", str(tmp_path))
    assert get_try_create_secret() == "env-key-value"
    assert not os.path.exists(tmp_path / ".secret_key")


def test_generated_key_persists_in_upload_folder(monkeypatch, tmp_path):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("SECRET_KEY_FILE", raising=False)
    monkeypatch.setenv("UPLOAD_FOLDER", str(tmp_path))
    monkeypatch.chdir(tmp_path)

    secret = get_try_create_secret()
    assert len(secret) == 44  # base64 of 32 random bytes

    key_file = tmp_path / ".secret_key"
    assert key_file.read_text() == secret
    assert oct(os.stat(key_file).st_mode & 0o777) == "0o600"

    # A second start reads the persisted key instead of minting a new one.
    assert get_try_create_secret() == secret


def test_legacy_key_file_is_read_and_migrated(monkeypatch, tmp_path):
    workdir = tmp_path / "work"
    uploads = tmp_path / "uploads"
    workdir.mkdir()
    uploads.mkdir()
    (workdir / "secret_key").write_text("legacy-key-value")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("SECRET_KEY_FILE", raising=False)
    monkeypatch.setenv("UPLOAD_FOLDER", str(uploads))
    monkeypatch.chdir(workdir)

    assert get_try_create_secret() == "legacy-key-value"
    assert (uploads / ".secret_key").read_text() == "legacy-key-value"


def test_secret_key_file_override(monkeypatch, tmp_path):
    key_file = tmp_path / "custom" / "key.txt"
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("SECRET_KEY_FILE", str(key_file))
    monkeypatch.setenv("UPLOAD_FOLDER", str(tmp_path))
    monkeypatch.chdir(tmp_path)

    secret = get_try_create_secret()
    assert key_file.read_text() == secret
    assert get_try_create_secret() == secret


def test_unwritable_key_locations_fail_closed(monkeypatch, tmp_path):
    blocker = tmp_path / "blocker"
    blocker.write_text("not a directory")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("SECRET_KEY_FILE", str(blocker / "key"))
    monkeypatch.setenv("UPLOAD_FOLDER", str(tmp_path))
    monkeypatch.chdir(tmp_path)

    with pytest.raises(RuntimeError) as excinfo:
        get_try_create_secret()
    assert "SECRET_KEY" in str(excinfo.value)


def test_no_literal_fallback_key_in_source():
    with open(os.path.join(REPO_ROOT, "backend", "config.py")) as f:
        assert LITERAL_FALLBACK not in f.read()


def _app_with(config_class):
    app = Flask(__name__)
    app.config.from_object(config_class)
    app.config["TESTING"] = True  # skip DB validation for these tests
    return app


def test_session_cookie_secure_upgraded_for_https(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://warracker.example.com")
    monkeypatch.delenv("APP_BASE_URL", raising=False)
    app = _app_with(DevelopmentConfig)
    assert app.config["SESSION_COOKIE_SECURE"] is False
    DevelopmentConfig.init_app(app)
    assert app.config["SESSION_COOKIE_SECURE"] is True


def test_session_cookie_secure_stays_off_for_http(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "http://192.168.1.10:8005")
    monkeypatch.delenv("APP_BASE_URL", raising=False)
    app = _app_with(DevelopmentConfig)
    DevelopmentConfig.init_app(app)
    assert app.config["SESSION_COOKIE_SECURE"] is False


def test_session_cookie_secure_uses_app_base_url(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.setenv("APP_BASE_URL", "https://warracker.example.com")
    app = _app_with(DevelopmentConfig)
    DevelopmentConfig.init_app(app)
    assert app.config["SESSION_COOKIE_SECURE"] is True


def test_production_config_never_downgraded(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "http://192.168.1.10:8005")
    monkeypatch.delenv("APP_BASE_URL", raising=False)
    app = _app_with(ProductionConfig)
    ProductionConfig.init_app(app)
    assert app.config["SESSION_COOKIE_SECURE"] is True
