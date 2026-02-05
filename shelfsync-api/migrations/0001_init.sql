CREATE TABLE IF NOT EXISTS health_checks (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
