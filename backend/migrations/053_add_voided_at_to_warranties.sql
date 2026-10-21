-- Migration 053: voided_at on warranties (issue #250)
-- Manual warranty termination: a warranty can be marked void (conditions
-- broken, unauthorized repair, etc.) without deleting it or changing its
-- expiration date. Mirrors archived_at (migration 045): NULL = not void.
ALTER TABLE warranties ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_voided_at ON warranties(voided_at);
