"""Required database credentials for 1.0.7 (#221).

The built-in defaults for DB_USER, DB_PASSWORD, DB_ADMIN_USER, and
DB_ADMIN_PASSWORD are gone. DB_USER and DB_PASSWORD (or DATABASE_URL
with credentials) remain strictly required. DB_ADMIN_USER and
DB_ADMIN_PASSWORD are optional with no built-in defaults: omitting both
skips the optional admin role in 010_configure_admin_roles.sql, while
setting only one fails closed naming the missing counterpart.
"""
import importlib.util
import json
import os
import subprocess
import sys
import uuid

import psycopg2
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


def test_missing_required_db_vars_are_named(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    app = _app_with_db_values()
    assert Config._missing_db_vars(app) == ["DB_USER", "DB_PASSWORD"]
    with pytest.raises(RuntimeError) as excinfo:
        Config.init_app(app)
    assert "DB_USER" in str(excinfo.value)
    assert "DB_PASSWORD" in str(excinfo.value)


def test_optional_admin_vars_may_both_be_unset(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    app = _app_with_db_values(DB_USER="alice", DB_PASSWORD="secret")
    assert Config._missing_db_vars(app) == []
    Config.init_app(app)
    assert app.config["MAX_CONTENT_LENGTH"] > 0


def test_partial_admin_vars_are_rejected(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    app_user_only = _app_with_db_values(
        DB_USER="alice", DB_PASSWORD="secret", DB_ADMIN_USER="admin")
    assert Config._missing_db_vars(app_user_only) == ["DB_ADMIN_PASSWORD"]
    with pytest.raises(RuntimeError, match="DB_ADMIN_PASSWORD"):
        Config.init_app(app_user_only)

    app_pass_only = _app_with_db_values(
        DB_USER="alice", DB_PASSWORD="secret", DB_ADMIN_PASSWORD="admin-secret")
    assert Config._missing_db_vars(app_pass_only) == ["DB_ADMIN_USER"]
    with pytest.raises(RuntimeError, match="DB_ADMIN_USER"):
        Config.init_app(app_pass_only)


def test_database_url_can_supply_app_credentials(monkeypatch):
    app = _app_with_db_values()
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://alice:secret@db:5432/warranty_db")
    assert Config._missing_db_vars(app) == []

    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://alice@db:5432/warranty_db")
    assert Config._missing_db_vars(app) == ["DB_PASSWORD"]

    app_partial_admin = _app_with_db_values(DB_ADMIN_USER="admin")
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://alice:secret@db:5432/warranty_db")
    assert Config._missing_db_vars(app_partial_admin) == ["DB_ADMIN_PASSWORD"]


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


def test_apply_migrations_admin_credential_rules():
    spec = importlib.util.spec_from_file_location(
        "apply_migrations_under_test",
        os.path.join(REPO_ROOT, "backend", "migrations", "apply_migrations.py"))
    migrations = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migrations)

    # Omitting both optional admin variables is allowed.
    migrations.DB_USER = "alice"
    migrations.DB_PASSWORD = "secret"
    migrations.DB_ADMIN_USER = None
    migrations.DB_ADMIN_PASSWORD = None
    migrations._validate_db_credentials()

    # Setting only DB_ADMIN_USER fails closed naming DB_ADMIN_PASSWORD.
    migrations.DB_ADMIN_USER = "admin"
    migrations.DB_ADMIN_PASSWORD = None
    with pytest.raises(RuntimeError, match="DB_ADMIN_PASSWORD"):
        migrations._validate_db_credentials()

    # Setting only DB_ADMIN_PASSWORD fails closed naming DB_ADMIN_USER.
    migrations.DB_ADMIN_USER = None
    migrations.DB_ADMIN_PASSWORD = "admin-secret"
    with pytest.raises(RuntimeError, match="DB_ADMIN_USER"):
        migrations._validate_db_credentials()

    # Missing app credentials still fail closed.
    migrations.DB_USER = None
    migrations.DB_PASSWORD = None
    migrations.DB_ADMIN_USER = None
    migrations.DB_ADMIN_PASSWORD = None
    with pytest.raises(RuntimeError) as excinfo:
        migrations._validate_db_credentials()
    assert "DB_USER" in str(excinfo.value)
    assert "DB_PASSWORD" in str(excinfo.value)


def _connect_pg(dbname):
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=dbname,
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


def _create_scratch_db():
    dbname = f"warranty_creds_{uuid.uuid4().hex[:8]}"
    conn = _connect_pg("postgres")
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(
                f'CREATE DATABASE "{dbname}" OWNER "{os.environ["DB_USER"]}"'
            )
    finally:
        conn.close()
    return dbname


def _drop_scratch_db(dbname):
    conn = _connect_pg("postgres")
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = %s",
                (dbname,),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{dbname}"')
    finally:
        conn.close()


def test_apply_migrations_fresh_db_without_admin_credentials():
    """Fresh database migrates cleanly with only DB_USER and DB_PASSWORD."""
    dbname = _create_scratch_db()
    try:
        conn = _connect_pg(dbname)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT rolname FROM pg_roles")
                roles_before = {row[0] for row in cur.fetchall()}
        finally:
            conn.close()

        env = {
            k: v for k, v in os.environ.items()
            if k not in ("DB_ADMIN_USER", "DB_ADMIN_PASSWORD", "DATABASE_URL")
        }
        env["DB_NAME"] = dbname
        script = os.path.join(
            REPO_ROOT, "backend", "migrations", "apply_migrations.py"
        )
        result = subprocess.run(
            [sys.executable, script],
            env=env, capture_output=True, text=True, timeout=600,
        )
        assert result.returncode == 0, result.stdout[-3000:] + result.stderr[-3000:]

        conn = _connect_pg(dbname)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT filename FROM migrations")
                applied = {row[0] for row in cur.fetchall()}
                assert "010_configure_admin_roles.sql" in applied
                cur.execute("SELECT to_regclass('warranties')")
                assert cur.fetchone()[0] is not None
                cur.execute("SELECT rolname FROM pg_roles")
                roles_after = {row[0] for row in cur.fetchall()}
                assert roles_after == roles_before
        finally:
            conn.close()
    finally:
        _drop_scratch_db(dbname)


def test_apply_migrations_fresh_db_with_explicit_admin_credentials():
    """Explicit DB_ADMIN_USER + DB_ADMIN_PASSWORD still apply cleanly (including % in password)."""
    dbname = _create_scratch_db()
    admin_role = f"WarrackerAdmin_{uuid.uuid4().hex[:6]}"
    try:
        env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
        env["DB_NAME"] = dbname
        env["DB_ADMIN_USER"] = admin_role
        env["DB_ADMIN_PASSWORD"] = "Strong%AdminPass!123"
        script = os.path.join(
            REPO_ROOT, "backend", "migrations", "apply_migrations.py"
        )
        result = subprocess.run(
            [sys.executable, script],
            env=env, capture_output=True, text=True, timeout=600,
        )
        assert result.returncode == 0, result.stdout[-3000:] + result.stderr[-3000:]

        conn = _connect_pg(dbname)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT filename FROM migrations")
                applied = {row[0] for row in cur.fetchall()}
                assert "010_configure_admin_roles.sql" in applied
                cur.execute(
                    "SELECT rolcreaterole, rolsuper FROM pg_roles WHERE rolname = %s",
                    (os.environ["DB_USER"],),
                )
                can_create_role = any(cur.fetchone() or (False, False))
                if can_create_role:
                    cur.execute(
                        "SELECT 1 FROM pg_roles WHERE rolname = %s",
                        (admin_role,),
                    )
                    assert cur.fetchone() is not None
        finally:
            conn.close()
    finally:
        _drop_scratch_db(dbname)
        conn = _connect_pg("postgres")
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                cur.execute(f'DROP ROLE IF EXISTS "{admin_role}"')
        except psycopg2.Error:
            pass
        finally:
            conn.close()


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
    assert 'Target="DB_ADMIN_USER" Default=""' in unraid_template
    assert 'Target="DB_ADMIN_PASSWORD" Default=""' in unraid_template
