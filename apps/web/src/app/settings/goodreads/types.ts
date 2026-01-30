export type ShelfSource = {
  id: string;
  source_type: string;
  provider: string;
  source_ref: string;
  meta: Record<string, unknown>;
  is_active: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

export type ShelfItem = {
  id: string;
  title: string;
  author: string;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
  shelf: string | null;
  needs_fuzzy_match: boolean;
};

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: { key: string; error: string }[];
};
