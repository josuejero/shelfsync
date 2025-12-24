"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const router = useRouter();
  const [sources, setSources] = useState<ShelfSource[]>([]);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rssUrl, setRssUrl] = useState("");
  const [shelfName, setShelfName] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onLogout() {
    await apiFetch("/v1/auth/logout", { method: "POST" });
    router.push("/signin");
  }

  async function loadData() {
    setLoading(true);
    try {
      const [sourceList, itemList] = await Promise.all([
        apiFetch<ShelfSource[]>("/v1/shelf-sources"),
        apiFetch<ShelfItem[]>("/v1/shelf-items?limit=200"),
      ]);
      setSources(sourceList);
      setItems(itemList);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load shelf data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const withMetadata = items.filter((item) => item.isbn13 || item.isbn10 || item.asin).length;
    const needsFuzzy = items.filter((item) => item.needs_fuzzy_match).length;
    return { total, withMetadata, needsFuzzy };
  }, [items]);

  async function handleRssSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSummary(null);
    setBusy(true);

    try {
      const result = await apiFetch<ImportSummary>("/v1/shelf-sources/rss", {
        method: "POST",
        body: JSON.stringify({ rss_url: rssUrl, shelf_name: shelfName || null }),
      });
      setSummary(result);
      setRssUrl("");
      setShelfName("");
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "RSS import failed.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCsvSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csvFile) return;

    setError(null);
    setSummary(null);
    setBusy(true);

    try {
      const data = new FormData();
      data.append("file", csvFile);
      const result = await apiFetch<ImportSummary>("/v1/shelf-sources/csv", {
        method: "POST",
        body: data,
      });
      setSummary(result);
      setCsvFile(null);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "CSV import failed.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  const latestItems = items.slice(0, 8);

  return (
    <AuthGuard>
      <main className="min-h-screen">
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute right-10 top-12 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,_rgba(42,157,143,0.2),_rgba(42,157,143,0))] blur-3xl" />
            <div className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,_rgba(217,93,57,0.2),_rgba(217,93,57,0))] blur-3xl" />
          </div>

          <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-black/40">Library snapshot</p>
                <h1 className="font-display text-3xl sm:text-4xl">Your ShelfSync dashboard</h1>
              </div>
              <button
                className="rounded-full border border-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em]"
                onClick={onLogout}
              >
                Log out
              </button>
            </header>

            <section className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-black/10 bg-white/70 p-6 shadow-[0_25px_60px_-48px_var(--shadow)]">
                <p className="text-xs uppercase tracking-[0.3em] text-black/40">Titles</p>
                <p className="mt-3 text-3xl font-semibold">{stats.total}</p>
                <p className="text-xs text-black/50">imported so far</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white/70 p-6 shadow-[0_25px_60px_-48px_var(--shadow)]">
                <p className="text-xs uppercase tracking-[0.3em] text-black/40">Metadata</p>
                <p className="mt-3 text-3xl font-semibold text-[var(--accent-2)]">
                  {stats.withMetadata}
                </p>
                <p className="text-xs text-black/50">with ISBN or ASIN</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white/70 p-6 shadow-[0_25px_60px_-48px_var(--shadow)]">
                <p className="text-xs uppercase tracking-[0.3em] text-black/40">Needs review</p>
                <p className="mt-3 text-3xl font-semibold text-[var(--accent)]">
                  {stats.needsFuzzy}
                </p>
                <p className="text-xs text-black/50">may need fuzzy match</p>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-black/10 bg-[var(--card)] p-6 shadow-[0_30px_80px_-55px_var(--shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-black/40">Connect a shelf</p>
                    <h2 className="font-display text-2xl">Import Goodreads data</h2>
                  </div>
                  <p className="text-xs text-black/50">RSS is fastest; CSV is great for exports.</p>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <form className="space-y-4" onSubmit={handleRssSubmit}>
                    <div className="rounded-2xl border border-black/10 bg-white/70 p-5">
                      <p className="text-sm font-semibold">RSS feed</p>
                      <p className="text-xs text-black/50">
                        Paste the Goodreads shelf RSS URL you want to sync.
                      </p>
                      <div className="mt-4 space-y-3">
                        <input
                          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2 text-sm"
                          placeholder="https://www.goodreads.com/shelf/rss?user=..."
                          value={rssUrl}
                          onChange={(event) => setRssUrl(event.target.value)}
                          required
                        />
                        <input
                          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2 text-sm"
                          placeholder="Shelf name (optional)"
                          value={shelfName}
                          onChange={(event) => setShelfName(event.target.value)}
                        />
                        <button
                          className="w-full rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          disabled={busy}
                          type="submit"
                        >
                          Connect RSS
                        </button>
                      </div>
                    </div>
                  </form>

                  <form className="space-y-4" onSubmit={handleCsvSubmit}>
                    <div className="rounded-2xl border border-black/10 bg-white/70 p-5">
                      <p className="text-sm font-semibold">CSV export</p>
                      <p className="text-xs text-black/50">
                        Upload the Goodreads export.csv from your account settings.
                      </p>
                      <div className="mt-4 space-y-3">
                        <input
                          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2 text-sm"
                          type="file"
                          accept=".csv"
                          onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
                          required
                        />
                        <button
                          className="w-full rounded-xl bg-[var(--accent-2)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          disabled={busy || !csvFile}
                          type="submit"
                        >
                          Upload CSV
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {summary ? (
                  <div className="mt-6 rounded-2xl border border-black/10 bg-white/70 p-4 text-sm">
                    <p className="font-semibold">Latest import</p>
                    <p className="text-xs text-black/60">
                      Created {summary.created}, updated {summary.updated}, skipped {summary.skipped}
                    </p>
                    {summary.errors.length ? (
                      <p className="mt-2 text-xs text-[var(--accent)]">
                        {summary.errors.slice(0, 2).join("; ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {error ? (
                  <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-black/10 bg-white/70 p-5 shadow-[0_30px_80px_-55px_var(--shadow)]">
                  <p className="text-xs uppercase tracking-[0.3em] text-black/40">Connected sources</p>
                  <h2 className="font-display text-2xl">Your shelf inputs</h2>
                  <div className="mt-4 space-y-3 text-sm text-black/60">
                    {loading ? (
                      <p>Loading sources...</p>
                    ) : sources.length ? (
                      sources.map((source) => (
                        <div
                          key={source.id}
                          className="rounded-2xl border border-black/10 bg-white/80 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-black">
                              {source.shelf_name || source.source_type.toUpperCase()}
                            </p>
                            <span className="rounded-full bg-black/5 px-3 py-1 text-xs">
                              {source.source_type}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-black/50">{source.source_ref}</p>
                          <p className="mt-2 text-xs text-black/40">
                            {source.last_imported_at
                              ? `Last imported ${new Date(source.last_imported_at).toLocaleDateString()}`
                              : "Not imported yet"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p>No sources yet. Connect RSS or upload CSV to get started.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-black/10 bg-white/70 p-5 shadow-[0_30px_80px_-55px_var(--shadow)]">
                  <p className="text-xs uppercase tracking-[0.3em] text-black/40">Availability</p>
                  <h2 className="font-display text-2xl">Next actions</h2>
                  <div className="mt-4 space-y-3 text-sm text-black/60">
                    <p>Connect a library adapter to start availability checks.</p>
                    <div className="rounded-2xl border border-black/10 bg-white/80 p-4 text-xs uppercase tracking-[0.25em] text-black/40">
                      Library adapters coming next
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-[0_30px_80px_-55px_var(--shadow)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-black/40">Latest imports</p>
                  <h2 className="font-display text-2xl">Recently synced titles</h2>
                </div>
                <span className="text-xs text-black/40">Top 8</span>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {loading ? (
                  <p className="text-sm text-black/60">Loading items...</p>
                ) : latestItems.length ? (
                  latestItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-black/10 bg-white/80 p-4">
                      <p className="text-sm font-semibold text-black">{item.title}</p>
                      <p className="text-xs text-black/50">{item.author}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-black/40">
                        {item.isbn13 || item.isbn10 || item.asin ? (
                          <span className="rounded-full bg-black/5 px-2 py-1">metadata</span>
                        ) : (
                          <span className="rounded-full bg-black/5 px-2 py-1">no id</span>
                        )}
                        {item.needs_fuzzy_match ? (
                          <span className="rounded-full bg-black/5 px-2 py-1">fuzzy</span>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-black/60">
                    No items yet. Import a shelf to see your list here.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}

type ShelfSource = {
  id: string;
  source_type: string;
  source_ref: string;
  shelf_name: string | null;
  created_at: string;
  last_imported_at: string | null;
};

type ShelfItem = {
  id: string;
  title: string;
  author: string;
  isbn13: string | null;
  isbn10: string | null;
  asin: string | null;
  goodreads_book_id: string | null;
  normalized_key: string;
  needs_fuzzy_match: boolean;
};

type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};
