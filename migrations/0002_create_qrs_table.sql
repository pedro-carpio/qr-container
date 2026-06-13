-- Migration number: 0002 	 2026-06-13T21:25:10.590Z

CREATE TABLE IF NOT EXISTS qrs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    qr_string TEXT NOT NULL,
    expiration_date TEXT NOT NULL,
    bank TEXT,
    is_fallback INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_amount ON qrs (user_id, amount) WHERE is_fallback = 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_fallback ON qrs (user_id) WHERE is_fallback = 1;
