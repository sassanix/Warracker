-- Migration 052: claim_documents table (issue #148)
-- Documents attached to warranty claims: claim approval/rejection letters,
-- photos of the defect, repair invoices, and similar evidence. A document is
-- either a locally uploaded file (file_path set) or a Paperless-ngx document
-- (paperless_document_id set) — exactly one of the two.
CREATE TABLE IF NOT EXISTS claim_documents (
    id SERIAL PRIMARY KEY,
    claim_id INTEGER NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500),
    paperless_document_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT claim_documents_exactly_one_source
        CHECK ((file_path IS NOT NULL) <> (paperless_document_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_claim_documents_claim_id ON claim_documents(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_documents_file_path ON claim_documents(file_path);
CREATE INDEX IF NOT EXISTS idx_claim_documents_paperless_id ON claim_documents(paperless_document_id);
