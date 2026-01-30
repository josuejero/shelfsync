"use client";

import { useGoodreadsSync } from "./useGoodreadsSync";

export default function GoodreadsSettingsPage() {
  const {
    state: {
      rssUrl,
      shelf,
      rssSource,
      items,
      summary,
      csvFile,
      busy,
      error,
    },
    setField,
    connectRss,
    syncNow,
    disconnect,
    uploadCsv,
  } = useGoodreadsSync();

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
              onChange={(e) => setField({ rssUrl: e.target.value })}
              placeholder="https://www.goodreads.com/review/list_rss/..."
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Shelf label (stored as metadata)</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={shelf}
              onChange={(e) => setField({ shelf: e.target.value })}
            />
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
            onChange={(e) => setField({ csvFile: e.target.files?.[0] || null })}
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
