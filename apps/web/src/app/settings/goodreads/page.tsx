"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

type ShelfSource = {
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

type ShelfItem = {
  id: string;
  title: string;
  author: string;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
  shelf: string | null;
  needs_fuzzy_match: boolean;
};

type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: { key: string; error: string }[];
};

export default function GoodreadsSettingsPage() {
  const [rssUrl, setRssUrl] = useState("http://localhost:4010/mock/goodreads/shelf/demo/read/rss");
  const [shelf, setShelf] = useState("to-read");

  const [rssSource, setRssSource] = useState<ShelfSource | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshItems(sourceId?: string) {
    const qs = new URLSearchParams();
    if (sourceId) qs.set("source_id", sourceId);
    const rows = await apiFetch<ShelfItem[]>(`/v1/shelf-items?${qs.toString()}`);
    setItems(rows);
  }

  async function connectRss() {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const src = await apiFetch<ShelfSource>("/v1/shelf-sources/rss", {
        method: "POST",
        body: JSON.stringify({ rss_url: rssUrl, shelf, sync_now: true }),
      });
      setRssSource(src);

      // Let the worker run; poll once after a short delay.
      setTimeout(() => {
        refreshItems(src.id).catch(() => undefined);
      }, 750);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    if (!rssSource) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<{ job_id: string }>(`/v1/shelf-sources/${rssSource.id}/sync`, { method: "POST" });
      setTimeout(() => {
        refreshItems(rssSource.id).catch(() => undefined);
      }, 750);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!rssSource) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<void>(`/v1/shelf-sources/${rssSource.id}`, { method: "DELETE" });
      setRssSource(null);
      setItems([]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadCsv() {
    if (!csvFile) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", csvFile);
      const res = await apiFetch<ImportSummary>("/v1/shelf-sources/csv", {
        method: "POST",
        body: fd,
      });
      setSummary(res);
      await refreshItems();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Load items on first open (works even before connecting)
    refreshItems().catch(() => undefined);
  }, []);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Goodreads</h1>
          <p className="text-gray-600">Connect an RSS shelf or upload a Goodreads CSV export.</p>
        </header>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <section className="rounded-2xl border p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">Connect RSS</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium">RSS URL (or path)</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={rssUrl}
              onChange={(e) => setRssUrl(e.target.value)}
              placeholder="https://www.goodreads.com/review/list_rss/..."
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Shelf label (stored as metadata)</label>
            <input className="w-full rounded-xl border px-3 py-2" value={shelf} onChange={(e) => setShelf(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
              onClick={connectRss}
              disabled={busy}
            >
              Connect & Import
            </button>

            <button
              className="rounded-xl border px-4 py-2 disabled:opacity-60"
              onClick={syncNow}
              disabled={busy || !rssSource}
            >
              Re-import (Sync)
            </button>

            <button
              className="rounded-xl border px-4 py-2 disabled:opacity-60"
              onClick={disconnect}
              disabled={busy || !rssSource}
            >
              Disconnect
            </button>
          </div>

          {rssSource ? (
            <div className="text-sm text-gray-700">
              <div>
                <span className="font-medium">Connected:</span> {rssSource.source_ref}
              </div>
              <div>
                <span className="font-medium">Last sync:</span> {rssSource.last_synced_at || "(not yet)"}
              </div>
              {rssSource.last_sync_status === "error" ? (
                <div className="text-red-700">{rssSource.last_sync_error}</div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No RSS source connected yet.</div>
          )}
        </section>

        <section className="rounded-2xl border p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">CSV Upload (fallback)</h2>
          <p className="text-sm text-gray-600">
            Export from Goodreads: <span className="font-medium">My Books → Import and Export → Export Library</span>.
          </p>

          <input
            type="file"
            accept=".csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
          />

          <button
            className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
            onClick={uploadCsv}
            disabled={busy || !csvFile}
          >
            Upload & Import
          </button>

          {summary ? (
            <div className="rounded-xl border bg-gray-50 p-4 text-sm">
              <div className="font-medium">Import summary</div>
              <div>Created: {summary.created}</div>
              <div>Updated: {summary.updated}</div>
              <div>Skipped: {summary.skipped}</div>
              {summary.errors?.length ? (
                <div className="mt-2">
                  <div className="font-medium">Errors</div>
                  <ul className="list-disc pl-5">
                    {summary.errors.slice(0, 20).map((e) => (
                      <li key={`${e.key}-${e.error}`}>{e.key}: {e.error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">Imported shelf items</h2>
          <div className="text-sm text-gray-600">Showing most recently updated first.</div>

          <div className="divide-y rounded-xl border">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No items yet. Connect RSS or upload CSV.</div>
            ) : (
              items.map((b) => (
                <div key={b.id} className="p-4">
                  <div className="font-medium">{b.title}</div>
                  <div className="text-sm text-gray-700">{b.author}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {b.isbn13 ? `ISBN13: ${b.isbn13}` : b.isbn10 ? `ISBN: ${b.isbn10}` : b.asin ? `ASIN: ${b.asin}` : "No ISBN (fuzzy match later)"}
                    {b.shelf ? ` · shelf: ${b.shelf}` : ""}
                    {b.needs_fuzzy_match ? " · needs match" : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}