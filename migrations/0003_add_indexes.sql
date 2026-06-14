-- Migration number: 0003 	 2026-06-14T00:00:00.000Z

-- Covers: qrsList and admin/userQrs → WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
-- Also satisfies COUNT(*) WHERE user_id = ? via index-only scan
CREATE INDEX IF NOT EXISTS idx_qrs_user_created ON qrs(user_id, created_at DESC);

-- Covers: qrsExpiring → WHERE user_id = ? AND expiration_date > ? AND expiration_date < ? ORDER BY expiration_date ASC
CREATE INDEX IF NOT EXISTS idx_qrs_user_expiration ON qrs(user_id, expiration_date);

-- Covers: admin/users and admin/pending → WHERE is_fully_registered = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
CREATE INDEX IF NOT EXISTS idx_users_status_created ON users(is_fully_registered, created_at DESC);

-- Covers: admin/users without status filter → ORDER BY created_at DESC LIMIT ? OFFSET ?
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
