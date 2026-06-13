-- Migration number: 0001 	 2026-06-13T21:24:46.099Z

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    company_name TEXT,
    slug TEXT UNIQUE,
    is_fully_registered INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_slug ON users(slug);
