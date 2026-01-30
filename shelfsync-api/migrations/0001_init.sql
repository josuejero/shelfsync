-- Migration number: 0001 	 2026-01-30T17:42:12.905Z
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  library_system TEXT,
  preferred_formats JSON NOT NULL DEFAULT '[]',
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shelf_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'goodreads',
  source_ref TEXT NOT NULL,
  meta JSON NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shelf_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  shelf_source_id TEXT,
  external_id TEXT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn10 TEXT,
  isbn13 TEXT,
  asin TEXT,
  normalized_title TEXT NOT NULL,
  normalized_author TEXT NOT NULL,
  shelf TEXT,
  needs_fuzzy_match INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (shelf_source_id) REFERENCES shelf_sources (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  isbn10 TEXT,
  isbn13 TEXT,
  asin TEXT,
  raw JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_catalog_items_provider_item UNIQUE (provider, provider_item_id)
);

CREATE TABLE IF NOT EXISTS catalog_matches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  shelf_item_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  method TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (shelf_item_id) REFERENCES shelf_items (id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_item_id) REFERENCES catalog_items (id) ON DELETE CASCADE,
  CONSTRAINT uq_catalog_match_user_shelf_item UNIQUE (user_id, shelf_item_id)
);

CREATE TABLE IF NOT EXISTS availability_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL,
  copies_available INTEGER,
  copies_total INTEGER,
  holds INTEGER,
  deep_link TEXT,
  last_checked_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_item_id) REFERENCES catalog_items (id) ON DELETE CASCADE,
  CONSTRAINT uq_availability_user_item_format UNIQUE (user_id, catalog_item_id, format)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  shelf_item_id TEXT NOT NULL,
  format TEXT NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  deep_link TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (shelf_item_id) REFERENCES shelf_items (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shelf_sources_user_id ON shelf_sources (user_id);
CREATE INDEX IF NOT EXISTS idx_shelf_items_user_id ON shelf_items (user_id);
CREATE INDEX IF NOT EXISTS idx_shelf_items_shelf_source_id ON shelf_items (shelf_source_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_shelf_items_source_external_unique ON shelf_items (shelf_source_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_matches_user_id ON catalog_matches (user_id);
CREATE INDEX IF NOT EXISTS idx_catalog_matches_shelf_item_id ON catalog_matches (shelf_item_id);
CREATE INDEX IF NOT EXISTS idx_catalog_matches_catalog_item_id ON catalog_matches (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_availability_snapshots_user_id ON availability_snapshots (user_id);
CREATE INDEX IF NOT EXISTS idx_availability_snapshots_catalog_item_id ON availability_snapshots (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_user_id ON sync_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_kind ON sync_runs (kind);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs (status);
CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON notification_events (user_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_shelf_item_id ON notification_events (shelf_item_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_created_at ON notification_events (created_at);
