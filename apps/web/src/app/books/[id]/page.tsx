"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthGuard } from "@/components/AuthGuard";
import { apiFetch } from "@/lib/api";

type BookDetail = {
  shelf_item: {
    id: string;
    title: string;
    author: string | null;
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
  match:
    | {
        method: string;
        confidence: number;
        evidence: Record<string, unknown>;
        catalog_item: {
          id: string;
          provider: string;
          provider_item_id: string;
          title: string;
          author: string | null;
          isbn10: string | null;
          isbn13: string | null;
          asin: string | null;
        };
      }
    | null;
  availability: {
    format: string;
    status: string;
    copies_available: number | null;
    copies_total: number | null;
    holds: number | null;
    deep_link: string | null;
    last_checked_at: string;
  }[];
  settings: { library_system: string | null; preferred_formats: string[]; updated_at: string };
};

export default function BookDetailPage() {
  const params = useParams();
  const id = String((params as any).id);

  const [data, setData] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      setLoading(true);
      try {
        const res = await apiFetch<BookDetail>(`/v1/books/${id}`);
        setData(res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load book.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const book = data?.shelf_item;

  return (
    <AuthGuard>
      <main className="min-h-screen px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <header className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl tracking-tight">Book</h1>
                <p className="text-sm text-black/60">Match + availability details.</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Link className="rounded-full border border-black/10 px-4 py-2 hover:bg-black/5" href="/dashboard">
                  Back
                </Link>
                <Link className="rounded-full border border-black/10 px-4 py-2 hover:bg-black/5" href="/settings">
                  Preferences
                </Link>
              </div>
            </div>
          </header>

          {loading ? <div className="text-sm text-black/60">Loading…</div> : null}
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {error.includes("429") ? "Too many requests. Please try again in a moment." : error}
            </div>
          ) : null}

          {!loading && !error && data && book ? (
            <>
              <section className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm">
                <div className="font-display text-2xl tracking-tight">{book.title}</div>
                <div className="text-sm text-black/60">{book.author ?? "Unknown author"}</div>

                <div className="mt-4 grid gap-2 text-sm">
                  <div><span className="text-black/50">Shelf:</span> {book.shelf ?? "—"}</div>
                  <div className="text-xs text-black/60">
                    ISBN13: {book.isbn13 ?? "—"} · ISBN10: {book.isbn10 ?? "—"} · ASIN: {book.asin ?? "—"}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-black/50">Match</h2>
                {data.match ? (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-black/50">Confidence:</span> {Math.round(data.match.confidence * 100)}% ·{" "}
                      <span className="text-black/50">Method:</span> {data.match.method}
                    </div>
                    <div className="text-xs text-black/60">
                      Provider: {data.match.catalog_item.provider} · Provider item: {data.match.catalog_item.provider_item_id}
                    </div>
                    <pre className="mt-3 overflow-x-auto rounded-2xl border border-black/10 bg-white p-4 text-xs">
{JSON.stringify(data.match.evidence ?? {}, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="text-sm text-black/60">No match yet. Run matching from the dashboard.</div>
                )}
              </section>

              <section className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-black/50">Availability</h2>
                {data.settings.library_system ? null : (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                    Select a library in <Link className="underline" href="/settings">Preferences</Link> to enable availability.
                  </div>
                )}

                {data.availability.length ? (
                  <div className="space-y-3">
                    {data.availability.map((a) => (
                      <div key={a.format} className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{a.format}</div>
                          <div className="text-black/60">{a.status}</div>
                        </div>
                        <div className="mt-2 text-xs text-black/60">
                          Copies: {a.copies_available ?? "—"}/{a.copies_total ?? "—"} · Holds: {a.holds ?? "—"}
                        </div>
                        <div className="mt-2 text-xs text-black/60">
                          Last checked: {new Date(a.last_checked_at).toLocaleString()}
                        </div>
                        {a.deep_link ? (
                          <a
                            className="mt-3 inline-block rounded-full border border-black/10 px-4 py-2 text-xs hover:bg-black/5"
                            href={a.deep_link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open in library
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-black/60">No availability data yet.</div>
                )}

                <div className="mt-4 text-xs text-black/50">
                  Source: {data.source.source_type ?? "—"}
                  {data.source.last_synced_at ? ` · last shelf sync: ${new Date(data.source.last_synced_at).toLocaleString()}` : ""}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </AuthGuard>
  );
}