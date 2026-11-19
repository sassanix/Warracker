-- Migration 056: team note entries on warranties (next release)
-- A warranty's single notes field stays owner-edited. Team members who
-- can view a warranty may add entries here instead, each attributed to
-- its author with a timestamp, and an entry can be deleted by its
-- author, the warranty owner, or an admin.
CREATE TABLE IF NOT EXISTS warranty_note_entries (
    id SERIAL PRIMARY KEY,
    warranty_id INTEGER NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_warranty_note_entries_warranty ON warranty_note_entries(warranty_id);
CREATE INDEX IF NOT EXISTS idx_warranty_note_entries_user ON warranty_note_entries(user_id);
