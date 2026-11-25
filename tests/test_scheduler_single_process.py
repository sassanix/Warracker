"""Notification scheduler runs in exactly one process (#299).

create_app must never start the scheduler under gunicorn (the master
would start it before forking and every worker would inherit a running
copy); the single scheduler is started in the master from when_ready.
Threshold sends are claimed up front so a concurrent copy cannot send
the same threshold twice, and a forked worker discards the inherited
database pool without closing it (closing would kill the master's
connections).
"""
import os
import types
from datetime import date, timedelta

import pytest
from flask import Flask

import backend.db_handler as db_handler
import backend.notifications as notifications
from backend.notifications import (
    claim_thresholds,
    discard_inherited_scheduler,
    filter_to_due_thresholds,
    init_scheduler,
    mark_thresholds_sent,
    should_run_scheduler,
    unclaim_thresholds,
)

TODAY = date.today()


def _set_env(monkeypatch, master=False, worker=None):
    """Set exactly the scheduler environment for one scenario."""
    monkeypatch.delenv("WARRACKER_GUNICORN_MASTER", raising=False)
    monkeypatch.delenv("GUNICORN_WORKER_ID", raising=False)
    if master:
        monkeypatch.setenv("WARRACKER_GUNICORN_MASTER", "1")
    if worker is not None:
        monkeypatch.setenv("GUNICORN_WORKER_ID", str(worker))


# --- should_run_scheduler: only a non-gunicorn process starts it ---

def test_should_run_in_dev_server(monkeypatch):
    _set_env(monkeypatch)
    assert should_run_scheduler() is True


def test_should_not_run_in_gunicorn_master(monkeypatch):
    _set_env(monkeypatch, master=True)
    assert should_run_scheduler() is False


def test_should_not_run_in_any_gunicorn_worker(monkeypatch):
    for worker_id in ("0", "1", "2"):
        _set_env(monkeypatch, master=True, worker=worker_id)
        assert should_run_scheduler() is False


def test_should_not_run_in_worker_without_master_flag(monkeypatch):
    _set_env(monkeypatch, worker="0")
    assert should_run_scheduler() is False


def test_should_run_in_gunicorn_master_without_config_flag(monkeypatch):
    # Fallback for a gunicorn invocation that does not use our config:
    # nothing marks the master, so the old single-process behavior
    # applies rather than losing notifications entirely.
    _set_env(monkeypatch)
    assert should_run_scheduler() is True


# --- claim_thresholds: only one of two concurrent claims wins ---

def _user_id(db_connection, username):
    with db_connection.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        return cur.fetchone()[0]


def _insert_warranty(db_connection, user_id):
    with db_connection, db_connection.cursor() as cur:
        cur.execute(
            "INSERT INTO warranties (product_name, purchase_date, "
            "expiration_date, user_id, is_lifetime, archived_at, voided_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
            ("Claim Test", TODAY - timedelta(days=300),
             TODAY + timedelta(days=7), user_id, False, None, None),
        )
        return cur.fetchone()[0]


@pytest.fixture()
def due_pair(client, user_factory, db_connection):
    user = user_factory()
    wid = _insert_warranty(db_connection, _user_id(db_connection, user["username"]))
    return ({"warranty_id": wid}, 7)


def test_claim_wins_once_across_two_connections(due_pair):
    conn1 = db_handler.get_db_connection()
    conn2 = db_handler.get_db_connection()
    try:
        assert claim_thresholds([due_pair], "apprise", conn1) == [due_pair]
        assert claim_thresholds([due_pair], "apprise", conn2) == []
    finally:
        db_handler.release_db_connection(conn1)
        db_handler.release_db_connection(conn2)


def test_unclaim_makes_threshold_due_again(due_pair):
    conn = db_handler.get_db_connection()
    try:
        assert claim_thresholds([due_pair], "apprise", conn) == [due_pair]
        assert claim_thresholds([due_pair], "apprise", conn) == []
        unclaim_thresholds([due_pair], "apprise", conn)
        assert claim_thresholds([due_pair], "apprise", conn) == [due_pair]
    finally:
        db_handler.release_db_connection(conn)


def test_mark_after_claim_keeps_record(due_pair):
    conn = db_handler.get_db_connection()
    try:
        claim_thresholds([due_pair], "apprise", conn)
        mark_thresholds_sent([due_pair], "apprise", conn)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM notification_log "
                "WHERE warranty_id = %s AND days_before = %s AND channel = %s",
                (due_pair[0]["warranty_id"], 7, "apprise"),
            )
            assert cur.fetchone()[0] == 1
        assert claim_thresholds([due_pair], "apprise", conn) == []
    finally:
        db_handler.release_db_connection(conn)


def test_filter_excludes_claimed_threshold(due_pair):
    conn = db_handler.get_db_connection()
    try:
        claim_thresholds([due_pair], "apprise", conn)
        assert filter_to_due_thresholds(
            [due_pair[0]], [30, 7], "apprise", conn) == []
    finally:
        db_handler.release_db_connection(conn)


# --- discard_inherited_scheduler: a forked copy never sends ---

def test_discard_with_no_scheduler_is_a_noop(monkeypatch):
    monkeypatch.setattr(notifications, "scheduler", None)
    monkeypatch.setattr(notifications, "scheduler_initialized", False)
    discard_inherited_scheduler()
    assert notifications.scheduler is None
    assert notifications.scheduler_initialized is False


def test_discard_removes_job_and_marks_stopped(monkeypatch):
    removed = []
    fake = types.SimpleNamespace(
        remove_job=lambda job_id: removed.append(job_id),
        state=1,
    )
    monkeypatch.setattr(notifications, "scheduler", fake)
    monkeypatch.setattr(notifications, "scheduler_initialized", True)
    discard_inherited_scheduler()
    assert removed == ["notification_job"]
    assert fake.state == 0
    assert notifications.scheduler is None
    assert notifications.scheduler_initialized is False


# --- init_scheduler: a second call cannot add the job twice ---

def test_init_scheduler_twice_adds_one_job(monkeypatch):
    _set_env(monkeypatch)
    app = Flask(__name__)
    # The app fixture already started a scheduler in this process; set
    # it aside so this test owns the scheduler it makes, then restore
    # it live (shutting down a scheduler this test did not create
    # would leave a dead reference behind for the atexit hook).
    saved_scheduler = notifications.scheduler
    saved_initialized = notifications.scheduler_initialized
    saved_retry = notifications.scheduler_retry_attempted
    notifications.scheduler = None
    notifications.scheduler_initialized = False
    notifications.scheduler_retry_attempted = False
    mine = None
    try:
        assert init_scheduler(
            app, db_handler.get_db_connection,
            db_handler.release_db_connection) is True
        assert init_scheduler(
            app, db_handler.get_db_connection,
            db_handler.release_db_connection) is True
        mine = notifications.scheduler
        assert [j.id for j in mine.get_jobs()] == ["notification_job"]
    finally:
        if mine is not None:
            try:
                mine.shutdown()
            except Exception:
                pass
        notifications.scheduler = saved_scheduler
        notifications.scheduler_initialized = saved_initialized
        notifications.scheduler_retry_attempted = saved_retry


# --- _close_stale_pool_if_forked: discard without closing ---

def test_forked_pool_is_discarded_and_recreated(db_connection):
    real_pool = db_handler.connection_pool
    assert real_pool is not None
    db_handler.pool_pid = os.getpid() + 999999
    try:
        db_handler._close_stale_pool_if_forked(os.getpid())
        assert db_handler.connection_pool is None
        assert db_handler.pool_pid is None
        conn = db_handler.get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                assert cur.fetchone()[0] == 1
        finally:
            db_handler.release_db_connection(conn)
    finally:
        # The discarded pool is gone for good; the fresh pool created
        # above is the live one now. Nothing to restore.
        pass


def test_discard_wakes_event_and_kills_greenlet(monkeypatch):
    events = []
    fake = types.SimpleNamespace(
        remove_job=lambda job_id: events.append(("remove", job_id)),
        state=1,
        _event=types.SimpleNamespace(set=lambda: events.append(("event_set",))),
        _greenlet=types.SimpleNamespace(kill=lambda block=False: events.append(("kill", block))),
    )
    monkeypatch.setattr(notifications, "scheduler", fake)
    monkeypatch.setattr(notifications, "scheduler_initialized", True)
    discard_inherited_scheduler()
    assert ("remove", "notification_job") in events
    assert ("event_set",) in events
    assert ("kill", False) in events
    assert notifications.scheduler is None


def test_worker_get_scheduler_status_reads_master_snapshot(monkeypatch):
    """Under gunicorn, /api/admin/scheduler-status hits a worker whose local
    scheduler was discarded; it must read the live snapshot published by the
    gunicorn master instead of reporting the scheduler as stopped."""
    from datetime import datetime, UTC

    fake_job = types.SimpleNamespace(
        id="notification_job",
        next_run_time=datetime(2026, 11, 25, 12, 0, 0, tzinfo=UTC),
        trigger="interval[0:02:00]",
    )
    fake_master_sched = types.SimpleNamespace(
        running=True,
        get_jobs=lambda: [fake_job],
    )
    monkeypatch.setattr(notifications, "scheduler", fake_master_sched)
    monkeypatch.setattr(notifications, "scheduler_initialized", True)
    monkeypatch.setenv("WARRACKER_GUNICORN_MASTER", "1")
    monkeypatch.setenv("WARRACKER_GUNICORN_MASTER_PID", str(os.getpid()))
    monkeypatch.delenv("GUNICORN_WORKER_ID", raising=False)

    try:
        notifications._write_master_scheduler_status()

        # Simulate a gunicorn worker that discarded its inherited scheduler
        monkeypatch.setattr(notifications, "scheduler", None)
        monkeypatch.setattr(notifications, "scheduler_initialized", False)
        monkeypatch.setenv("GUNICORN_WORKER_ID", "0")

        status = notifications.get_scheduler_status()
        assert status["scheduler_initialized"] is True
        assert status["scheduler_running"] is True
        assert status["scheduler_owner"] == "gunicorn-master"
        assert len(status["scheduler_jobs"]) == 1
        assert status["scheduler_jobs"][0]["id"] == "notification_job"
    finally:
        monkeypatch.delenv("GUNICORN_WORKER_ID", raising=False)
        notifications._clear_master_scheduler_status()

