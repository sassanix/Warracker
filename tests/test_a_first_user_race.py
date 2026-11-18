"""AUTH-07: first-user registration race.

Ten concurrent first registrations used to all succeed and leave two
owners. The registration transaction now takes a PostgreSQL advisory
lock before the user-count check, so exactly one becomes owner.

The end-to-end race test below is opportunistic: in-process threads
share the GIL, so the race window is narrow and a run without the fix
can pass by luck. The regression protection is the lock-semantics
test (a second transaction cannot acquire the lock while the first
holds it) plus the source pins (both provisioning paths take it).

The race test file sorts first in the suite (test_a_...) so it can
run against an empty users table, and it deletes the users it
creates, leaving the table empty for the tests that follow. If the
table is not empty (someone runs this file after other tests), it
skips.
"""
import threading
import uuid
from pathlib import Path

import psycopg2
import pytest

from backend.auth_utils import FIRST_USER_LOCK_KEY, acquire_first_user_lock


def test_first_user_lock_blocks_concurrent_acquire(db_connection):
    """The advisory lock serializes: a second transaction cannot take
    it while the first holds it, and can once the first commits."""
    conn_b = psycopg2.connect(db_connection.dsn)
    try:
        with db_connection.cursor() as cur_a:
            acquire_first_user_lock(cur_a)
            with conn_b.cursor() as cur_b:
                cur_b.execute("SET lock_timeout = '1s'")
                with pytest.raises(psycopg2.errors.LockNotAvailable):
                    acquire_first_user_lock(cur_b)
                conn_b.rollback()
        db_connection.commit()
        with conn_b.cursor() as cur_b:
            acquire_first_user_lock(cur_b)
        conn_b.commit()
    finally:
        conn_b.close()


def test_first_user_lock_taken_by_both_provisioning_paths():
    """Both first-user paths call acquire_first_user_lock before the
    user-count check that decides owner and admin."""
    repo = Path(__file__).resolve().parent.parent
    register = (repo / "backend" / "auth_routes.py").read_text()
    assert "acquire_first_user_lock(cur)" in register
    oidc = (repo / "backend" / "oidc_handler.py").read_text()
    assert "acquire_first_user_lock(cur)" in oidc


def test_concurrent_first_registrations_mint_one_owner(app, db_connection):
    with db_connection.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] != 0:
            pytest.skip(
                "users table is not empty; the race needs a fresh database")
    prefix = "race-" + uuid.uuid4().hex[:8]
    usernames = [f"{prefix}-{i}" for i in range(10)]
    results = {}

    def _register(username):
        # Each thread needs its own test client.
        with app.test_client() as thread_client:
            r = thread_client.post("/api/auth/register", json={
                "username": username,
                "email": f"{username}@test.local",
                "password": "TestPass123!",
                "first_name": "Race",
                "last_name": "User",
            })
            results[username] = r.status_code

    threads = [threading.Thread(target=_register, args=(u,))
               for u in usernames]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert len(results) == 10, results
        assert all(code in (200, 201) for code in results.values()), results
        with db_connection.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM users WHERE username LIKE %s",
                (prefix + "-%",))
            assert cur.fetchone()[0] == 10
            cur.execute("SELECT COUNT(*) FROM users WHERE is_owner = TRUE")
            assert cur.fetchone()[0] == 1
            cur.execute("SELECT COUNT(*) FROM users WHERE is_admin = TRUE")
            assert cur.fetchone()[0] == 1
    finally:
        with db_connection, db_connection.cursor() as cur:
            cur.execute(
                "DELETE FROM users WHERE username LIKE %s", (prefix + "-%",))
