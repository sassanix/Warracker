"""Deprecation of the built-in database credential defaults (#221).

1.0.5 keeps the defaults working but warns at startup about any of
DB_USER / DB_PASSWORD / DB_ADMIN_USER / DB_ADMIN_PASSWORD that are not
set explicitly; 1.0.7 removes the defaults and makes them required.
These tests pin the softened behavior so the 1.0.7 flip is a
deliberate change, not a surprise.
"""
import logging

import pytest
from flask import Flask

from backend.config import Config, ProductionConfig

DB_VARS = ("DB_USER", "DB_PASSWORD", "DB_ADMIN_USER", "DB_ADMIN_PASSWORD")


@pytest.fixture()
def bare_app():
    return Flask(__name__)


def _clear_db_env(monkeypatch):
    for var in DB_VARS:
        monkeypatch.delenv(var, raising=False)


def test_warns_naming_all_unset_vars(bare_app, monkeypatch, caplog):
    _clear_db_env(monkeypatch)
    with caplog.at_level(logging.WARNING, logger="backend.config"):
        Config._warn_unset_db_vars(bare_app)
    messages = [r.getMessage() for r in caplog.records
                if "DEPRECATION WARNING" in r.getMessage()]
    assert len(messages) == 1
    for var in DB_VARS:
        assert var in messages[0]
    assert "1.0.7" in messages[0]


def test_warns_only_for_the_unset_vars(bare_app, monkeypatch, caplog):
    _clear_db_env(monkeypatch)
    monkeypatch.setenv("DB_USER", "alice")
    monkeypatch.setenv("DB_PASSWORD", "secret")
    with caplog.at_level(logging.WARNING, logger="backend.config"):
        Config._warn_unset_db_vars(bare_app)
    messages = [r.getMessage() for r in caplog.records
                if "DEPRECATION WARNING" in r.getMessage()]
    assert len(messages) == 1
    assert "DB_ADMIN_USER" in messages[0]
    assert "DB_ADMIN_PASSWORD" in messages[0]
    assert "DB_USER" not in messages[0].split(":", 1)[1].split("not set")[0]


def test_no_warning_when_all_set(bare_app, monkeypatch, caplog):
    for var in DB_VARS:
        monkeypatch.setenv(var, "set-value")
    with caplog.at_level(logging.WARNING, logger="backend.config"):
        Config._warn_unset_db_vars(bare_app)
    assert not [r for r in caplog.records
                if "DEPRECATION WARNING" in r.getMessage()]


def test_no_warning_in_testing(bare_app, monkeypatch, caplog):
    _clear_db_env(monkeypatch)
    bare_app.config["TESTING"] = True
    with caplog.at_level(logging.WARNING, logger="backend.config"):
        Config._warn_unset_db_vars(bare_app)
    assert not [r for r in caplog.records
                if "DEPRECATION WARNING" in r.getMessage()]


def test_production_init_starts_on_defaults(bare_app, monkeypatch, caplog):
    """The softened #221: production init must not refuse to start."""
    _clear_db_env(monkeypatch)
    with caplog.at_level(logging.WARNING, logger="backend.config"):
        ProductionConfig.init_app(bare_app)
    assert any("DEPRECATION WARNING" in r.getMessage()
               for r in caplog.records)


def test_builtin_defaults_still_present():
    """Pins the 1.0.5 state; 1.0.7 removes these defaults on purpose.

    The class attributes are bound from the environment at import
    time, so read them in a subprocess with the four variables
    removed from the environment.
    """
    import json
    import os
    import subprocess
    import sys

    env = {k: v for k, v in os.environ.items() if k not in DB_VARS}
    code = (
        "import json; from backend.config import Config; "
        "print(json.dumps([Config.DB_USER, Config.DB_PASSWORD, "
        "Config.DB_ADMIN_USER, Config.DB_ADMIN_PASSWORD]))"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], env=env,
        capture_output=True, text=True, timeout=60,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    )
    assert result.returncode == 0, result.stderr
    values = json.loads(result.stdout.strip().splitlines()[-1])
    assert values == [
        "warranty_user",
        "warranty_password",
        "warracker_admin",
        "default_admin_password",
    ]
