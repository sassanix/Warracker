"""Required database credentials for 1.0.7 (#221).

The built-in defaults for DB_USER, DB_PASSWORD, DB_ADMIN_USER, and
DB_ADMIN_PASSWORD are gone. Startup and the standalone database scripts
must fail with a clear message naming what is missing, instead of
silently falling back to known credentials.
"""
import importlib.util
import json
import os
import subprocess
import sys

import pytest
from flask import Flask

from backend.config import Config

DB_VARS = ("DB_USER", "DB_PASSWORD", "DB_ADMIN_USER", "DB_ADMIN_PASSWORD")
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _app_with_db_values(**values):
    app = Flask(__name__)
    app.config["TESTING"] = False
    for var in DB_VARS:
        app.config[var] = values.get(var)
    return app


def test_missing_all_db_vars_are_named(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    app = _app_with_db_values()
    assert Config._missing_db_vars(app) == list(DB_VARS)
    with pytest.raises(RuntimeError) as excinfo:
        Config.init_app(app)
    for var in DB_VARS:
        assert var in str(excinfo.value)


def test_missing_only_admin_vars_are_named(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    app = _app_with_db_values(DB_USER="alice", DB_PASSWORD="secret")
    assert Config._missing_db_vars(app) == ["DB_ADMIN_USER", "DB_ADMIN_PASSWORD"]


def test_database_url_can_supply_app_credentials(monkeypatch):
    app = _app_with_db_values(
        DB_ADMIN_USER="admin", DB_ADMIN_PASSWORD="admin-secret")
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://alice:secret@db:5432/warranty_db")
    assert Config._missing_db_vars(app) == []

    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://alice@db:5432/warranty_db")
    assert Config._missing_db_vars(app) == ["DB_PASSWORD"]


def test_testing_config_skips_db_validation(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    app = _app_with_db_values()
    app.config["TESTING"] = True
    assert Config._missing_db_vars(app) == []


def test_init_app_succeeds_when_all_db_vars_are_set(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    app = _app_with_db_values(
        DB_USER="alice", DB_PASSWORD="secret",
        DB_ADMIN_USER="admin", DB_ADMIN_PASSWORD="admin-secret")
    Config.init_app(app)
    assert app.config["MAX_CONTENT_LENGTH"] > 0


def test_no_builtin_defaults_in_a_clean_process():
    env = {k: v for k, v in os.environ.items()
           if k not in DB_VARS and k != "DATABASE_URL"}
    env["SECRET_KEY"] = "test-secret"
    code = """
import importlib.util
import json

from backend.config import Config
from backend import db_handler

spec = importlib.util.spec_from_file_location(
    "apply_migrations", "backend/migrations/apply_migrations.py")
migrations = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migrations)

print(json.dumps([
    Config.DB_USER, Config.DB_PASSWORD,
    Config.DB_ADMIN_USER, Config.DB_ADMIN_PASSWORD,
    db_handler.DB_USER, db_handler.DB_PASSWORD,
    migrations.DB_USER, migrations.DB_PASSWORD,
    migrations.DB_ADMIN_USER, migrations.DB_ADMIN_PASSWORD,
]))
"""
    result = subprocess.run(
        [sys.executable, "-c", code], env=env,
        capture_output=True, text=True, timeout=60, cwd=REPO_ROOT)
    assert result.returncode == 0, result.stderr
    values = json.loads(result.stdout.strip().splitlines()[-1])
    assert values == [None] * 10


def test_db_handler_rejects_missing_app_credentials(monkeypatch):
    from backend import db_handler

    monkeypatch.setattr(db_handler, "DATABASE_URL", None)
    monkeypatch.setattr(db_handler, "DB_USER", None)
    monkeypatch.setattr(db_handler, "DB_PASSWORD", "secret")
    with pytest.raises(RuntimeError, match="DB_USER and DB_PASSWORD"):
        db_handler._connection_kwargs()


def test_fix_permissions_rejects_missing_app_credentials(monkeypatch):
    from backend import fix_permissions

    monkeypatch.setattr(fix_permissions, "DB_USER", "alice")
    monkeypatch.setattr(fix_permissions, "DB_PASSWORD", None)
    with pytest.raises(RuntimeError, match="DB_USER and DB_PASSWORD"):
        fix_permissions.create_db_connection(max_retries=1, retry_delay=0)


def test_apply_migrations_rejects_missing_admin_credentials():
    spec = importlib.util.spec_from_file_location(
        "apply_migrations_under_test",
        os.path.join(REPO_ROOT, "backend", "migrations", "apply_migrations.py"))
    migrations = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migrations)
    migrations.DB_USER = "alice"
    migrations.DB_PASSWORD = "secret"
    migrations.DB_ADMIN_USER = None
    migrations.DB_ADMIN_PASSWORD = None
    with pytest.raises(RuntimeError) as excinfo:
        migrations._validate_db_credentials()
    assert "DB_ADMIN_USER" in str(excinfo.value)
    assert "DB_ADMIN_PASSWORD" in str(excinfo.value)


def test_no_credential_fallbacks_remain_in_runtime_sources():
    runtime_files = [
        "backend/config.py",
        "backend/db_handler.py",
        "backend/fix_permissions.py",
        "backend/migrations/apply_migrations.py",
    ]
    forbidden = [
        "os.environ.get('DB_USER',",
        "os.environ.get('DB_PASSWORD',",
        "os.environ.get('DB_ADMIN_USER',",
        "os.environ.get('DB_ADMIN_PASSWORD',",
        "else 'warranty_user'",
        "else 'warranty_password'",
    ]
    for relative_path in runtime_files:
        source = open(os.path.join(REPO_ROOT, relative_path)).read()
        for snippet in forbidden:
            assert snippet not in source, f"{snippet} remains in {relative_path}"

    unraid_template = open(os.path.join(REPO_ROOT, "unraid", "warracker.xml")).read()
    assert "default_admin_password" not in unraid_template
