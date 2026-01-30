-- Migration number: 0002 	 2026-01-30T18:09:17.386Z
INSERT OR IGNORE INTO libraries (id, name) VALUES
  ('nypl', 'New York Public Library'),
  ('bpl', 'Boston Public Library'),
  ('ppld', 'Portland Public Library');
