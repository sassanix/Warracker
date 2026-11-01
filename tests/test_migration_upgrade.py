"""Upgrade path: a database at the pre-1.0.4 schema (migrations
000-051) must upgrade cleanly to the current schema with its data
intact. 1.0.4 added migrations 052 (claim documents), 053 (voided_at)
and 054 (Paperless document ownership); this exercises exactly that
hop the way a real install would, by running apply_migrations.py
twice: once from a directory trimmed to the old migration set, then
once from the real one.
"""
import os
import shutil
import subprocess
import sys
import uuid

import psycopg2
import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS_DIR = os.path.join(REPO_ROOT, "backend", "migrations")
PRE_104_CUTOFF = "051"  # last migration shipped before 1.0.4


def _connect(dbname):
    pw = os.environ["DB_PASSWORD"]
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=dbname,
        user=os.environ["DB_USER"],
        password=pw,
    )


def _run_migrations(script_dir, dbname):
    env = dict(os.environ)
    env["DB_NAME"] = dbname
    result = subprocess.run(
        [sys.executable, os.path.join(script_dir, "apply_migrations.py")],
        env=env, capture_output=True, text=True, timeout=600,
    )
    assert result.returncode == 0, result.stdout[-3000:] + result.stderr[-3000:]


@pytest.fixture()
def scratch_db():
    dbname = f"warranty_upgrade_{uuid.uuid4().hex[:8]}"
    conn = _connect("postgres")
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f'CREATE DATABASE "{dbname}" OWNER "{os.environ["DB_USER"]}"')
    conn.close()
    yield dbname
    conn = _connect("postgres")
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f'DROP DATABASE IF EXISTS "{dbname}"')
    conn.close()


def test_upgrade_from_pre_104_schema(scratch_db, tmp_path):
    # 1. Build the old (pre-1.0.4) schema from a trimmed migration set.
    old_dir = tmp_path / "migrations_old"
    old_dir.mkdir()
    for name in os.listdir(MIGRATIONS_DIR):
        if name == "apply_migrations.py":
            shutil.copy(os.path.join(MIGRATIONS_DIR, name), old_dir / name)
        elif name[:3] <= PRE_104_CUTOFF and name.endswith((".sql", ".py")):
            shutil.copy(os.path.join(MIGRATIONS_DIR, name), old_dir / name)
    _run_migrations(str(old_dir), scratch_db)

    # 2. Seed representative pre-1.0.4 data.
    conn = _connect(scratch_db)
    with conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO users (username, email, password_hash) "
            "VALUES ('upgradeuser', 'upgrade@test.local', 'x') RETURNING id")
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO warranties (product_name, purchase_date, "
            "expiration_date, user_id) VALUES ('Legacy Toaster', "
            "'2024-05-01', '2026-05-01', %s) RETURNING id", (user_id,))
        warranty_id = cur.fetchone()[0]
    conn.close()

    # 3. Upgrade with the real migration set.
    _run_migrations(MIGRATIONS_DIR, scratch_db)

    # 4. The 1.0.4 migrations landed and the old data survived.
    conn = _connect(scratch_db)
    with conn.cursor() as cur:
        cur.execute("SELECT filename FROM migrations")
        applied = {row[0] for row in cur.fetchall()}
        assert "052_create_claim_documents_table.sql" in applied
        assert "053_add_voided_at_to_warranties.sql" in applied
        assert "054_create_paperless_document_ownership.sql" in applied

        cur.execute(
            "SELECT product_name, voided_at FROM warranties WHERE id = %s",
            (warranty_id,))
        name, voided_at = cur.fetchone()
        assert name == "Legacy Toaster"
        assert voided_at is None  # pre-existing rows are not voided

        cur.execute("SELECT to_regclass('claim_documents')")
        assert cur.fetchone()[0] is not None
        cur.execute("SELECT to_regclass('paperless_document_ownership')")
        assert cur.fetchone()[0] is not None
    conn.close()
