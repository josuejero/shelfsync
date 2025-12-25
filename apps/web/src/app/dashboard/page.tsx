import Link from "next/link";

import { apiFetch } from "@/lib/api";
import { compareReadNext, readNextTooltip, type ReadNext } from "@/lib/readNext";

type MatchMini = {
  catalog_item_id: string;
  provider: string;
  provider_item_id: string;
  method: string;
  confidence: number;
};

type Availability = {
  format: string;
  status: "available" | "hold" | "not_owned";
  copies_available: number | null;
  copies_total: number | null;
  holds: number | null;
  deep_link: string | null;
  last_checked_at: string;
};

type DashboardRow = {
  shelf_item_id: string;
  title: string;
  author: string | null;
  shelf: string | null;
  needs_fuzzy_match: boolean;
  match: MatchMini | null;
  availability: Availability[];
  read_next: ReadNext;
};

type DashboardResponse = {
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

type SortKey = "read_next" | "availability" | "title";

type FilterKey = "all" | "available" | "hold" | "not_owned";

function availabilityStatus(row: DashboardRow): FilterKey {
  if (!row.match) return "not_owned";
  if (row.availability.some((a) => a.status === "available")) return "available";
  if (row.availability.some((a) => a.status === "hold")) return "hold";
  return "not_owned";
}

function availabilityRank(row: DashboardRow): number {
  const s = availabilityStatus(row);
  if (s === "available") return 3;
  if (s === "hold") return 2;
  if (s === "not_owned") return 1;
  return 0;
}

export default async function DashboardPage() {
  const data = await apiFetch<DashboardResponse>(`/v1/dashboard?limit=200&offset=0&sort=read_next`);

  // Default sort is Read Next
  const defaultSort: SortKey = "read_next";
  const defaultFilter: FilterKey = "all";

  const rows = [...data.items];

  const sorted = rows.sort((a, b) => {
    if (defaultSort === "read_next") return compareReadNext(a, b);
    if (defaultSort === "availability") {
      const ra = availabilityRank(a);
      const rb = availabilityRank(b);
      if (ra !== rb) return rb - ra;
      return a.title.localeCompare(b.title);
    }
    return a.title.localeCompare(b.title);
  });

  const filtered = sorted.filter((r) => {
    if (defaultFilter === "all") return true;
    return availabilityStatus(r) === defaultFilter;
  });

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-600">
            Sorted by <span className="font-medium">Read Next</span>. This ranking prioritizes
            items available now, then shorter hold queues, using your format preferences.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Tip: hover ⓘ to see the explanation (tier, format, queue details).
          </p>
        </div>
        <Link href="/settings" className="px-3 py-2 rounded border text-sm hover:bg-gray-50">
          Settings
        </Link>
      </div>

      <div className="mt-4 rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left p-3">Title</th>
              <th className="text-left p-3">Shelf</th>
              <th className="text-left p-3">Availability</th>
              <th className="text-left p-3">Read Next</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const status = availabilityStatus(row);
              const rnTitle = readNextTooltip(row.read_next);
              return (
                <tr key={row.shelf_item_id} className="border-t">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/books/${row.shelf_item_id}`} className="font-medium hover:underline">
                        {row.title}
                      </Link>
                      <span
                        className="text-xs text-gray-500 cursor-help"
                        title={rnTitle}
                        aria-label="Read Next explanation"
                      >
                        ⓘ
                      </span>
                    </div>
                    {row.author ? <div className="text-gray-600">{row.author}</div> : null}
                    {row.needs_fuzzy_match ? (
                      <div className="text-xs text-amber-700 mt-1">Needs fuzzy match</div>
                    ) : null}
                  </td>
                  <td className="p-3">{row.shelf ?? "—"}</td>
                  <td className="p-3">
                    <div className="capitalize">{status.replace("_", " ")}</div>
                    {row.availability.length ? (
                      <div className="text-xs text-gray-600 mt-1">
                        {row.availability
                          .map((a) => {
                            const bits = [a.format, a.status];
                            if (a.status === "available" && a.copies_available != null) {
                              bits.push(`${a.copies_available} available`);
                            }
                            if (a.status === "hold" && a.holds != null) {
                              bits.push(`${a.holds} holds`);
                            }
                            return bits.join(" • ");
                          })
                          .join(" | ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <div className="capitalize">{row.read_next.tier.replace("_", " ")}</div>
                    <div className="text-xs text-gray-600 mt-1">Score: {row.read_next.score.toFixed(1)}</div>
                    {row.read_next.best_format ? (
                      <div className="text-xs text-gray-600">Best: {row.read_next.best_format}</div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-gray-600">
        <p>
          <span className="font-medium">How Read Next works:</span> Available now → Holds → Not owned.
          Within a tier, your preferred format order matters, and hold queue size breaks ties.
        </p>
      </div>
    </main>
  );
}