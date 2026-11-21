"""Database connection pool hardening and early auth release (PR #297).

Covers the pool and decorator hardening introduced in 1.0.7:
- _env_number validation and fallback for DB_POOL_MAX/MIN/WAIT_SECONDS.
- release_db_connection: None no-op, double-release idempotency,
  open-transaction rollback, and closed-connection slot recovery.
- get_db_connection: bounded waiting on pool exhaustion, wake-up when a
  connection returns, and rebuilding a closed pool on retry.
- token_required: releases its auth DB connection before running the
  route, returns JSON 500 on unhandled route errors, and propagates
  HTTPException unchanged.
"""
import threading
import time

import psycopg2
import pytest
from flask import Flask, abort, jsonify
from psycopg2 import extensions, pool

from backend import auth_utils, db_handler


def test_env_number_validation(monkeypatch):
    monkeypatch.delenv("TEST_POOL_NUM", raising=False)
    assert db_handler._env_number("TEST_POOL_NUM", 4, int, 1) == 4

    monkeypatch.setenv("TEST_POOL_NUM", "10")
    assert db_handler._env_number("TEST_POOL_NUM", 4, int, 1) == 10

    monkeypatch.setenv("TEST_POOL_NUM", "2.5")
    assert db_handler._env_number("TEST_POOL_NUM", 30.0, float, 0) == 2.5

    for bad in ("", "   ", "abc", "0", "-3"):
        monkeypatch.setenv("TEST_POOL_NUM", bad)
        assert db_handler._env_number("TEST_POOL_NUM", 4, int, 1) == 4, bad

    for bad_float in ("nan", "inf", "-inf", "-0.1", "not-a-float"):
        monkeypatch.setenv("TEST_POOL_NUM", bad_float)
        assert db_handler._env_number("TEST_POOL_NUM", 30.0, float, 0) == 30.0, bad_float


def test_release_db_connection_none_and_double_release(app):
    # None is a safe no-op.
    db_handler.release_db_connection(None)

    conn = db_handler.get_db_connection()
    assert id(conn) in db_handler._checked_out
    db_handler.release_db_connection(conn)
    assert id(conn) not in db_handler._checked_out

    # Second release must be ignored without raising or over-releasing slots.
    db_handler.release_db_connection(conn)

    # Pool still hands out and returns DB_POOL_MAX connections cleanly.
    held = [db_handler.get_db_connection() for _ in range(db_handler.DB_POOL_MAX)]
    try:
        assert len(held) == db_handler.DB_POOL_MAX
    finally:
        for c in held:
            db_handler.release_db_connection(c)


def test_release_rolls_back_open_transaction(app):
    conn = db_handler.get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        assert conn.info.transaction_status == extensions.TRANSACTION_STATUS_INTRANS
    finally:
        db_handler.release_db_connection(conn)

    # Next checkout must see an idle, usable connection.
    conn2 = db_handler.get_db_connection()
    try:
        assert conn2.info.transaction_status == extensions.TRANSACTION_STATUS_IDLE
        with conn2.cursor() as cur:
            cur.execute("SELECT 1")
            assert cur.fetchone()[0] == 1
        conn2.rollback()
    finally:
        db_handler.release_db_connection(conn2)


def test_release_resets_autocommit_to_false(app):
    conn = db_handler.get_db_connection()
    conn.autocommit = True
    db_handler.release_db_connection(conn)

    # Every connection in the pool must now have autocommit=False.
    held = [db_handler.get_db_connection() for _ in range(db_handler.DB_POOL_MAX)]
    try:
        assert all(not c.autocommit for c in held)
    finally:
        for c in held:
            db_handler.release_db_connection(c)


def test_release_discards_closed_connection_without_leaking_slot(app):
    conn = db_handler.get_db_connection()
    conn.close()
    assert conn.closed
    db_handler.release_db_connection(conn)

    # Every slot must still be acquirable after discarding a closed connection.
    held = [db_handler.get_db_connection() for _ in range(db_handler.DB_POOL_MAX)]
    try:
        for c in held:
            assert not c.closed
    finally:
        for c in held:
            db_handler.release_db_connection(c)


def test_pool_exhaustion_waits_and_times_out_or_succeeds(app, monkeypatch):
    monkeypatch.setattr(db_handler, "DB_POOL_WAIT_SECONDS", 0.25)
    held = [db_handler.get_db_connection() for _ in range(db_handler.DB_POOL_MAX)]
    try:
        start = time.monotonic()
        with pytest.raises(pool.PoolError, match="exhausted"):
            db_handler.get_db_connection()
        elapsed = time.monotonic() - start
        assert elapsed >= 0.2

        # Now release one slot mid-wait: the waiter must succeed cleanly.
        monkeypatch.setattr(db_handler, "DB_POOL_WAIT_SECONDS", 2.0)
        to_release = held.pop()

        def _release_later():
            time.sleep(0.15)
            db_handler.release_db_connection(to_release)

        t = threading.Thread(target=_release_later)
        t.start()
        acquired = db_handler.get_db_connection()
        t.join(timeout=5)
        try:
            assert not acquired.closed
        finally:
            db_handler.release_db_connection(acquired)
    finally:
        for c in held:
            db_handler.release_db_connection(c)


def test_closed_pool_rebuilds_on_retry(app):
    # Ensure a pool exists, then close it to simulate a reset/closed pool.
    c0 = db_handler.get_db_connection()
    db_handler.release_db_connection(c0)

    old_pool = db_handler.connection_pool
    old_pool.closeall()
    assert old_pool.closed

    conn = db_handler.get_db_connection()
    try:
        assert db_handler.connection_pool is not old_pool
        assert not db_handler.connection_pool.closed
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            assert cur.fetchone()[0] == 1
        conn.rollback()
    finally:
        db_handler.release_db_connection(conn)


def test_token_required_releases_auth_conn_and_handles_route_errors(
        app, user_factory):
    user = user_factory()
    observed_checked_out = []

    probe = Flask(__name__)
    probe.config["SECRET_KEY"] = app.config["SECRET_KEY"]
    probe.config["JWT_EXPIRATION_DELTA"] = app.config["JWT_EXPIRATION_DELTA"]

    @probe.route("/probe/ok")
    @auth_utils.token_required
    def _ok():
        observed_checked_out.append(len(db_handler._checked_out))
        return jsonify({"ok": True}), 200

    @probe.route("/probe/boom")
    @auth_utils.token_required
    def _boom():
        raise RuntimeError("unexpected route failure")

    @probe.route("/probe/http-error")
    @auth_utils.token_required
    def _http_err():
        abort(413)

    probe_client = probe.test_client()

    # Auth connection must already be released before the route body runs.
    r_ok = probe_client.get("/probe/ok", headers=user["headers"])
    assert r_ok.status_code == 200
    assert observed_checked_out == [0]

    # Unhandled route exceptions keep returning a JSON 500, not HTML.
    r_boom = probe_client.get("/probe/boom", headers=user["headers"])
    assert r_boom.status_code == 500
    assert r_boom.is_json
    assert "message" in r_boom.get_json()

    # HTTPException (such as 413) propagates instead of becoming a 500.
    r_http = probe_client.get("/probe/http-error", headers=user["headers"])
    assert r_http.status_code == 413
