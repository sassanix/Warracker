# backend/paperless_access.py
"""
Authorization helpers for Paperless-ngx documents.

Warracker connects to Paperless-ngx with a single shared API token, so
Paperless cannot distinguish Warracker users. Document ownership is tracked
in Warracker's own database (paperless_document_ownership, migration 054):
the user who uploaded a document through Warracker, or first linked it to
one of their warranties or claims, owns it here.

Rules:
  - Linking (warranty create/update, search-and-link, claim documents):
    a user may link a document they own, a document already referenced by
    one of their own warranties/claims, or a document nobody owns or
    references yet (first linker claims it). A document owned or referenced
    by another user can never be linked. Admins are unrestricted.
  - Viewing (serving): the document's owner, the owner of a warranty or
    claim referencing it, and admins may view. When global view is enabled,
    invoice/manual/photo documents referenced by any warranty are viewable
    by everyone global view covers — the same shared types as local files.
    "Other" documents and claim documents never join global view.
  - Search: non-admin users only see documents they own or reference.
"""

import logging

logger = logging.getLogger(__name__)

_WARRANTY_ID_CONDITION = (
    "(paperless_invoice_id = %s OR paperless_manual_id = %s "
    "OR paperless_photo_id = %s OR paperless_other_id = %s)"
)

_SHARED_ID_CONDITION = (
    "(paperless_invoice_id = %s OR paperless_manual_id = %s "
    "OR paperless_photo_id = %s)"
)


def get_paperless_document_owner(cur, document_id):
    """Return the owning user id for a Paperless document, or None."""
    cur.execute(
        "SELECT user_id FROM paperless_document_ownership WHERE paperless_document_id = %s",
        (document_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def record_paperless_document_owner(cur, document_id, user_id):
    """Record ownership of a Paperless document (first recorder wins)."""
    if document_id is None or user_id is None:
        return
    cur.execute(
        """
        INSERT INTO paperless_document_ownership (paperless_document_id, user_id)
        VALUES (%s, %s)
        ON CONFLICT (paperless_document_id) DO NOTHING
        """,
        (document_id, user_id),
    )


def _referenced_by(cur, document_id, user_id, own):
    """True when a warranty or claim-document reference to the document
    exists for the given user (own=True) or for any other user (own=False)."""
    op = "=" if own else "<>"
    cur.execute(
        f"SELECT 1 FROM warranties WHERE user_id {op} %s AND {_WARRANTY_ID_CONDITION} LIMIT 1",
        (user_id, document_id, document_id, document_id, document_id),
    )
    if cur.fetchone():
        return True
    cur.execute(
        f"""
        SELECT 1
        FROM claim_documents d
        JOIN warranty_claims c ON d.claim_id = c.id
        JOIN warranties w ON c.warranty_id = w.id
        WHERE d.paperless_document_id = %s AND w.user_id {op} %s
        LIMIT 1
        """,
        (document_id, user_id),
    )
    return cur.fetchone() is not None


def user_can_link_paperless_document(cur, user_id, is_admin, document_id):
    """True when the user may link this Paperless document to their own
    warranty or claim. See the module docstring for the rules."""
    if document_id is None:
        return True
    if is_admin:
        return True
    owner = get_paperless_document_owner(cur, document_id)
    if owner is not None:
        return owner == user_id
    if _referenced_by(cur, document_id, user_id, own=True):
        return True
    if _referenced_by(cur, document_id, user_id, own=False):
        return False
    return True


def check_paperless_document_access(cur, user_id, is_admin, document_id):
    """Access verdict for serving a Paperless document:
    'ok' (serve it), 'forbidden' (it exists but is not the requester's),
    or 'not_found' (no Warracker user owns or references it)."""
    if is_admin:
        return "ok"
    owner = get_paperless_document_owner(cur, document_id)
    if owner is not None and owner == user_id:
        return "ok"
    if _referenced_by(cur, document_id, user_id, own=True):
        return "ok"

    # Global view: shared document types (invoice, manual, photo) referenced
    # by any warranty are viewable by everyone global view covers.
    cur.execute(
        f"SELECT 1 FROM warranties WHERE {_SHARED_ID_CONDITION} LIMIT 1",
        (document_id, document_id, document_id),
    )
    if cur.fetchone():
        cur.execute(
            "SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')"
        )
        settings = {row[0]: row[1] for row in cur.fetchall()}
        global_view_enabled = settings.get("global_view_enabled", "true").lower() == "true"
        admin_only = settings.get("global_view_admin_only", "false").lower() == "true"
        if global_view_enabled and not admin_only:
            return "ok"

    known = owner is not None or _referenced_by(cur, document_id, user_id, own=False)
    return "forbidden" if known else "not_found"


def visible_paperless_document_ids(cur, user_id, is_admin):
    """The set of Paperless document ids a user may see in search results.
    Returns None for admins, meaning unrestricted."""
    if is_admin:
        return None
    ids = set()
    cur.execute(
        "SELECT paperless_document_id FROM paperless_document_ownership WHERE user_id = %s",
        (user_id,),
    )
    ids.update(row[0] for row in cur.fetchall())
    cur.execute(
        """
        SELECT paperless_invoice_id, paperless_manual_id, paperless_photo_id, paperless_other_id
        FROM warranties WHERE user_id = %s
        """,
        (user_id,),
    )
    for row in cur.fetchall():
        ids.update(value for value in row if value is not None)
    cur.execute(
        """
        SELECT d.paperless_document_id
        FROM claim_documents d
        JOIN warranty_claims c ON d.claim_id = c.id
        JOIN warranties w ON c.warranty_id = w.id
        WHERE w.user_id = %s AND d.paperless_document_id IS NOT NULL
        """,
        (user_id,),
    )
    ids.update(row[0] for row in cur.fetchall())
    return ids
