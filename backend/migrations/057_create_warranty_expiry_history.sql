-- Track warranty expiration date and lifetime changes on edit (issue #209)
CREATE TABLE IF NOT EXISTS warranty_expiry_history (
    id SERIAL PRIMARY KEY,
    warranty_id INTEGER NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
    previous_expiration_date DATE,
    new_expiration_date DATE,
    previous_is_lifetime BOOLEAN NOT NULL DEFAULT FALSE,
    new_is_lifetime BOOLEAN NOT NULL DEFAULT FALSE,
    reason VARCHAR(255),
    changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_warranty_expiry_history_warranty
    ON warranty_expiry_history (warranty_id, changed_at DESC, id DESC);
