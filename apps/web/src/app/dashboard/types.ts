import { type ReadNext } from "@/lib/readNext";

export type MatchMini = {
  catalog_item_id: string;
  provider: string;
  provider_item_id: string;
  method: string;
  confidence: number;
};

export type Availability = {
  format: string;
  status: "available" | "hold" | "not_owned";
  copies_available: number | null;
  copies_total: number | null;
  holds: number | null;
  deep_link: string | null;
  last_checked_at: string;
};

export type DashboardRow = {
  shelf_item_id: string;
  title: string;
  author: string | null;
  shelf: string | null;
  needs_fuzzy_match: boolean;
  match: MatchMini | null;
  availability: Availability[];
  read_next: ReadNext;
};

export type DashboardResponse = {
  settings: {
    library_system: string | null;
    preferred_formats: string[];
    updated_at: string;
  };
  last_sync: {
    source_type: string | null;
    source_id: string | null;
    last_synced_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
  };
  page: {
    limit: number;
    offset: number;
    total: number;
  };
  items: DashboardRow[];
};

export type SortKey = "read_next" | "availability" | "title";
export type FilterKey = "all" | "available" | "hold" | "not_owned";
