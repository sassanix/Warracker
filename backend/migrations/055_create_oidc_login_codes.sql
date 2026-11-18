-- Migration 055: one-time OIDC login codes (AUTH-03)
-- The SSO callback used to deliver the full 24h JWT in the redirect
-- URL (auth-redirect.html?token=...), which then persisted in browser
-- history. The callback now stores a short-lived single-use code and
-- redirects with ?code=; the frontend exchanges it for the JWT over
-- POST. Only the SHA-256 hash of the code is stored, so a database
-- read alone cannot redeem it, and each code is deleted on first use.
CREATE TABLE IF NOT EXISTS oidc_login_codes (
    code_hash VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_new_user BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_oidc_login_codes_user ON oidc_login_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_oidc_login_codes_expires ON oidc_login_codes(expires_at);
