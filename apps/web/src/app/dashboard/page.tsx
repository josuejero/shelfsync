"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AuthGuard } from "@/components/AuthGuard";
import { apiFetch } from "@/lib/api";

type DashboardResponse = {
  settings: { library_system: string | null; preferred_formats: string[]; updated_at: string };
  last_sync: {
    source_type: string | null;
    source_id: string | null;
    last_synced_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
  };
  page: { limit: number; offset: number; total: number };
  items: DashboardRow[];
};

type DashboardRow = {
  shelf_item_id: string;
  title: string;
  author: string | null;
  shelf: string | null;
  needs_fuzzy_match: boolean;
  match: {
    catalog_item_id: string;
    provider: string;
    provider_item_id: string;
    method: string;
    confidence: number;
  } | null;
  availability: Availability[];
};

type Availability = {
  format: string;
  status: string;
  copies_available: number | null;
  copies_total: number | null;
  holds: number | null;
  deep_link: string | null;
  last_checked_at: string;
};

function statusLabel(status: string) {
  if (status === "available") return "Available";
  if (status === "hold") return "On hold";
  if (status === "not_owned") return "Not owned";
  return status;
}

function pillClass(status: string) {
  if (status === "available") return "bg-emerald-100 text-emerald-900";
  if (status === "hold") return "bg-amber-100 text-amber-900";
  if (status === "not_owned") return "bg-slate-100 text-slate-900";
  return "bg-slate-100 text-slate-900";
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("title");

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<DashboardResponse>("/v1/dashboard?limit=200&offset=0");
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load dashboard.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    let rows = data.items;

    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = `${r.title} ${r.author ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (statusFilter !== "all") {
      rows = rows.filter((r) => {
        if (statusFilter === "unmatched") return !r.match;
        return r.availability.some((a) => a.status === statusFilter);
      });
    }

    const sortKey = sort;
    rows = [...rows].sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "confidence") return (b.match?.confidence ?? -1) - (a.match?.confidence ?? -1);
      if (sortKey === "availability") {
        const score = (r: DashboardRow) => {
          if (!r.match) return -2;
          if (r.availability.some((x) => x.status === "available")) return 2;
          if (r.availability.some((x) => x.status === "hold")) return 1;
          return 0;
        };
        return score(b) - score(a);
      }
      return 0;
    });

    return rows;
  }, [data, query, statusFilter, sort]);

  const settings = data?.settings;
  const lastSync = data?.last_sync;

  return (
    <AuthGuard>
      <main className="min-h-screen px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <header className="flex flex-col gap-3 rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl tracking-tight">Dashboard</h1>
                <p className="text-sm text-black/60">Your shelf, matched to your library.</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Link className="rounded-full border border-black/10 px-4 py-2 hover:bg-black/5" href="/settings">
                  Preferences
                </Link>
                <Link
                  className="rounded-full border border-black/10 px-4 py-2 hover:bg-black/5"
                  href="/settings/goodreads"
                >
                  Import/Connect
                </Link>
                <button
                  onClick={load}
                  className="rounded-full bg-black px-4 py-2 text-white hover:bg-black/90"
                >
                  Refresh
                </button>
              </div>
            </div>

            {settings?.library_system ? (
              <div className="text-sm text-black/70">
                <span className="font-medium">Library:</span> {settings.library_system} ·{" "}
                <span className="font-medium">Formats:</span> {settings.preferred_formats.join(", ") || "ebook"}
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                Pick a library in <Link className="underline" href="/settings">Preferences</Link> to enable availability.
              </div>
            )}

            {lastSync?.last_synced_at ? (
              <div className="text-xs text-black/60">
                Last shelf sync: {new Date(lastSync.last_synced_at).toLocaleString()} ({lastSync.source_type})
                {lastSync.last_sync_status === "error" ? ` · error: ${lastSync.last_sync_error}` : ""}
              </div>
            ) : (
              <div className="text-xs text-black/60">No shelf connected yet. Use Import/Connect.</div>
            )}
          </header>

          <section className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title/author…"
                className="w-full max-w-sm rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm"
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All</option>
                <option value="available">Available</option>
                <option value="hold">Hold</option>
                <option value="not_owned">Not owned</option>
                <option value="unmatched">Unmatched</option>
              </select>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="title">Sort: Title</option>
                <option value="availability">Sort: Availability</option>
                <option value="confidence">Sort: Match confidence</option>
              </select>
            </div>

            {loading ? <div className="text-sm text-black/60">Loading…</div> : null}
            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                {error.includes("429") ? "Too many requests. Please try again in a moment." : error}
              </div>
            ) : null}

            {!loading && !error && items.length === 0 ? (
              <div className="text-sm text-black/60">No items yet. Import a shelf to get started.</div>
            ) : null}

            {!loading && !error && items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full table-auto border-collapse text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-black/50">
                    <tr>
                      <th className="py-3 pr-4">Book</th>
                      <th className="py-3 pr-4">Shelf</th>
                      <th className="py-3 pr-4">Match</th>
                      <th className="py-3 pr-4">Availability</th>
                      <th className="py-3"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.shelf_item_id} className="border-t border-black/5">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{row.title}</div>
                          <div className="text-xs text-black/60">{row.author ?? "Unknown author"}</div>
                        </td>
                        <td className="py-3 pr-4 text-xs text-black/70">{row.shelf ?? "—"}</td>
                        <td className="py-3 pr-4 text-xs">
                          {row.match ? (
                            <span>
                              {Math.round(row.match.confidence * 100)}% · {row.match.method}
                            </span>
                          ) : (
                            <span className="text-black/50">Unmatched</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            {row.match ? (
                              row.availability.length ? (
                                row.availability.map((a) => (
                                  <span
                                    key={`${row.shelf_item_id}:${a.format}`}
                                    className={`rounded-full px-3 py-1 text-xs ${pillClass(a.status)}`}
                                    title={`${a.format} · ${statusLabel(a.status)}`}
                                  >
                                    {a.format}: {statusLabel(a.status)}
                                  </span>
                                ))
                              ) : (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-900">
                                  {settings?.library_system ? "Checking…" : "Select library"}
                                </span>
                              )
                            ) : (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-900">
                                Run matching
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3">
                          <button
                            className="rounded-full border border-black/10 px-4 py-2 text-xs hover:bg-black/5"
                            onClick={() => router.push(`/books/${row.shelf_item_id}`)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <footer className="text-xs text-black/50">
            Tip: repeated refreshes within the cache TTL should not trigger provider calls.
          </footer>
        </div>
      </main>
    </AuthGuard>
  );
}