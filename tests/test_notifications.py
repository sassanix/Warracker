"""Notification selection: get_expiring_warranties is the query every
email and Apprise reminder depends on. It must include warranties
inside the user's expiring-soon window and exclude everything else:
expired, lifetime, archived, voided, and other users' settings must
not leak in.
"""
from datetime import date, timedelta

from backend.db_handler import get_db_connection, release_db_connection
from backend.notifications import get_expiring_warranties

TODAY = date.today()


def _insert_warranty(cur, user_id, name, expires, **flags):
    cur.execute(
        "INSERT INTO warranties (product_name, purchase_date, "
        "expiration_date, user_id, is_lifetime, archived_at, voided_at) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (
            name,
            TODAY - timedelta(days=300),
            expires,
            user_id,
            flags.get("is_lifetime", False),
            flags.get("archived_at"),
            flags.get("voided_at"),
        ),
    )
    return cur.fetchone()[0]


def _selected_ids(user_id):
    rows = get_expiring_warranties(get_db_connection, release_db_connection)
    return {r["warranty_id"] for r in rows if r["user_id"] == user_id}


def test_expiring_selection_window_and_exclusions(client, user_factory,
                                                  db_connection):
    user = user_factory()
    conn = db_connection
    with conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s",
                    (user["username"],))
        user_id = cur.fetchone()[0]

        in_window = _insert_warranty(cur, user_id, "InWindow",
                                     TODAY + timedelta(days=10))
        boundary = _insert_warranty(cur, user_id, "Boundary",
                                    TODAY + timedelta(days=30))
        outside = _insert_warranty(cur, user_id, "Outside",
                                   TODAY + timedelta(days=45))
        expired = _insert_warranty(cur, user_id, "Expired",
                                   TODAY - timedelta(days=1))
        lifetime = _insert_warranty(cur, user_id, "Lifetime", None,
                                    is_lifetime=True)
        archived = _insert_warranty(cur, user_id, "Archived",
                                    TODAY + timedelta(days=5),
                                    archived_at=TODAY)
        voided = _insert_warranty(cur, user_id, "Voided",
                                  TODAY + timedelta(days=5),
                                  voided_at=TODAY)

    selected = _selected_ids(user_id)
    assert in_window in selected
    assert boundary in selected  # the window is inclusive
    assert outside not in selected
    assert expired not in selected
    assert lifetime not in selected
    assert archived not in selected
    assert voided not in selected


def test_expiring_selection_honors_user_preference(client, user_factory,
                                                   db_connection):
    user = user_factory()
    conn = db_connection
    with conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s",
                    (user["username"],))
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO user_preferences (user_id, expiring_soon_days) "
            "VALUES (%s, 7) ON CONFLICT (user_id) "
            "DO UPDATE SET expiring_soon_days = 7", (user_id,))
        near = _insert_warranty(cur, user_id, "Near", TODAY + timedelta(days=6))
        far = _insert_warranty(cur, user_id, "Far", TODAY + timedelta(days=10))

    selected = _selected_ids(user_id)
    assert near in selected
    assert far not in selected  # 10 days is outside this user's 7-day window
