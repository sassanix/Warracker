-- Migration 051: notification_log table (issue #188)
-- Records which expiry-threshold notifications have been sent per warranty,
-- so each threshold (e.g. 30 days, 7 days) notifies exactly once instead of
-- repeating every day until expiration.
CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    warranty_id INTEGER NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
    days_before INTEGER NOT NULL,
    channel VARCHAR(20) NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (warranty_id, days_before, channel)
);
CREATE INDEX IF NOT EXISTS idx_notification_log_warranty ON notification_log(warranty_id);
