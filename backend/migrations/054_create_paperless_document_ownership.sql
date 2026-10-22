-- Migration 054: paperless_document_ownership table (security fix)
-- Warracker talks to Paperless-ngx with one shared API token, so Paperless
-- itself cannot say which Warracker user a document belongs to. This table
-- records which Warracker user first brought a Paperless document into
-- Warracker — by uploading it through Warracker, or by linking it to one of
-- their warranties or claims. Search, linking, and serving are gated on it
-- so one user cannot enumerate, attach, or download another user's Paperless
-- documents (GHSA-fv62-3hrm-gf83, GHSA-3h89-rqfj-5674).
CREATE TABLE IF NOT EXISTS paperless_document_ownership (
    paperless_document_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_paperless_doc_ownership_user ON paperless_document_ownership(user_id);

-- Backfill: a document already linked from a warranty belongs to that
-- warranty's owner; a claim document belongs to the claim's warranty owner.
-- If two users somehow reference the same document, the lowest user id wins
-- the backfill and the other reference is handled by the runtime checks.
INSERT INTO paperless_document_ownership (paperless_document_id, user_id)
SELECT doc_id, MIN(user_id)
FROM (
    SELECT paperless_invoice_id AS doc_id, user_id FROM warranties WHERE paperless_invoice_id IS NOT NULL
    UNION ALL SELECT paperless_manual_id, user_id FROM warranties WHERE paperless_manual_id IS NOT NULL
    UNION ALL SELECT paperless_photo_id, user_id FROM warranties WHERE paperless_photo_id IS NOT NULL
    UNION ALL SELECT paperless_other_id, user_id FROM warranties WHERE paperless_other_id IS NOT NULL
    UNION ALL SELECT d.paperless_document_id, w.user_id
      FROM claim_documents d
      JOIN warranty_claims c ON d.claim_id = c.id
      JOIN warranties w ON c.warranty_id = w.id
      WHERE d.paperless_document_id IS NOT NULL
) s
WHERE doc_id IS NOT NULL
GROUP BY doc_id
ON CONFLICT (paperless_document_id) DO NOTHING;
