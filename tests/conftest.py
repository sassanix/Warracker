"""Fixtures for the Warracker API test suite.

The suite runs the real Flask app through its test client against a
dedicated PostgreSQL database that is dropped and recreated on every
run, with the production migrations applied — the same schema users
run. No application code is mocked; the only fake is Paperless-ngx
(tests/mock_paperless.py).

Environment (local defaults shown; CI sets its own):
  DB_HOST=127.0.0.1  DB_PORT=5432  DB_NAME=warranty_test_suite
  DB_USER=warranty_user  DB_PASSWORD=...   (role needs CREATEDB)
  SECRET_KEY / UPLOAD_FOLDER are set to throwaway test values.

Run:  pip install pytest && python -m pytest
"""
import itertools
import os
import subprocess
import sys
import tempfile
import threading
import uuid

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# The backend reads DB_* / SECRET_KEY at import time, so the test
# environment must be in place before anything imports it.
os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "warranty_test_suite")
os.environ.setdefault("DB_USER", "warranty_user")
os.environ.setdefault("DB_PASSWORD", "warranty_password")
os.environ.setdefault("SECRET_KEY", "warracker-test-secret-key-0123456789")
# Cap uploads at 1 MB so the 413 path is testable with a small file.
os.environ.setdefault("MAX_UPLOAD_MB", "1")
os.environ.setdefault(
    "UPLOAD_FOLDER",
    os.path.join(tempfile.gettempdir(), "warracker-test-uploads"),
)
os.makedirs(os.environ["UPLOAD_FOLDER"], exist_ok=True)

import psycopg2  # noqa: E402
import pytest  # noqa: E402


def _connect(dbname):
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=dbname,
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


@pytest.fixture(scope="session", autouse=True)
def _prepared_database():
    """Drop + recreate the suite database and apply all migrations."""
    name = os.environ["DB_NAME"]
    conn = _connect("postgres")
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s",
            (name,),
        )
        cur.execute(f'DROP DATABASE IF EXISTS "{name}"')
        cur.execute(f'CREATE DATABASE "{name}"')
    conn.close()

    migrations = os.path.join(REPO_ROOT, "backend", "migrations",
                              "apply_migrations.py")
    subprocess.run(
        [sys.executable, migrations],
        cwd=REPO_ROOT, env=dict(os.environ), check=True,
        capture_output=True, text=True,
    )
    yield


@pytest.fixture(scope="session")
def app():
    from backend import create_app

    return create_app("testing")


@pytest.fixture(scope="session")
def client(app):
    return app.test_client()


_counter = itertools.count(1)


def _register(client, username=None):
    n = next(_counter)
    username = username or f"user{n}_{uuid.uuid4().hex[:6]}"
    r = client.post("/api/auth/register", json={
        "username": username,
        "email": f"{username}@test.local",
        "password": "TestPass123!",
        "first_name": "Test",
        "last_name": "User",
    })
    assert r.status_code in (200, 201), r.get_data(as_text=True)
    token = r.get_json()["token"]
    return {
        "username": username,
        "headers": {"Authorization": f"Bearer {token}"},
    }


@pytest.fixture(scope="session")
def user_factory(client):
    """Callable that registers a fresh user and returns its auth bundle."""
    def _make(username=None):
        return _register(client, username)

    return _make


@pytest.fixture(scope="session")
def admin_user(user_factory):
    """The first registered user becomes owner + admin."""
    return user_factory("testadmin")


@pytest.fixture(scope="session")
def warranty_factory(client):
    """Callable posting a warranty form; returns the response."""
    def _make(headers, **fields):
        data = {
            "product_name": "Widget",
            "purchase_date": "2025-01-01",
            "exact_expiration_date": "2027-01-01",
        }
        data.update(fields)
        return client.post("/api/warranties", data=data, headers=headers)

    return _make


@pytest.fixture()
def db_connection():
    """Direct connection to the suite database (legacy-data setups)."""
    conn = _connect(os.environ["DB_NAME"])
    yield conn
    conn.close()


@pytest.fixture(scope="session")
def paperless_url():
    import mock_paperless

    server, url = mock_paperless.create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield url
    server.shutdown()


@pytest.fixture(scope="session")
def paperless_configured(admin_user, paperless_url):
    """Point the app's site settings at the mock Paperless server."""
    conn = _connect(os.environ["DB_NAME"])
    with conn, conn.cursor() as cur:
        for key, value in (
            ("paperless_enabled", "true"),
            ("paperless_url", paperless_url),
            ("paperless_api_token", "test-token"),
        ):
            cur.execute(
                "INSERT INTO site_settings (key, value) VALUES (%s, %s) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                (key, value),
            )
    conn.close()
    return paperless_url
