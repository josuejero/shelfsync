import { type ReadNext } from "@/lib/readNext";

export type Availability = {
  format: string;
  status: "available" | "hold" | "not_owned";
  copies_available: number | null;
  copies_total: number | null;
  holds: number | null;
  deep_link: string | null;
  last_checked_at: string;
};

export type CatalogItem = {
  id: string;
  provider: string;
  provider_item_id: string;
  title: string;
  author: string | null;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
};

export type Match = {
  method: string;
  confidence: number;
  evidence: Record<string, unknown>;
  catalog_item: CatalogItem;
} | null;

export type BookDetail = {
  shelf_item: {
    id: string;
    title: string;
    author: string;
    isbn10: string | null;
    isbn13: string | null;
    asin: string | null;
    shelf: string | null;
    needs_fuzzy_match: boolean;
    created_at: string;
  };
  source: {
    source_type: string | null;
    source_ref: string | null;
    last_synced_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
  };
  match: Match;
  availability: Availability[];
  settings: {
    library_system: string | null;
    preferred_formats: string[];
    updated_at: string;
  };
  read_next: ReadNext;
};

export type DashboardRow = {
  shelf_item_id: string;
  title: string;
  author: string | null;
  read_next: ReadNext;
};

export type DashboardResponse = {
  items: DashboardRow[];
  page: { total: number; limit: number; offset: number };
};
