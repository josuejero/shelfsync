"use client";

import Link from "next/link";

import { AuthGuard } from "@/components/AuthGuard";
import { useBookDetail } from "./useBookDetail";

export default function BookDetailPage({ params }: { params: { id: string } }) {
  return (
    <AuthGuard>
      <BookDetailInner id={params.id} />
    </AuthGuard>
  );
}

function BookDetailInner({ id }: { id: string }) {
  const { data, rank, rankLoading, error, tooltip } = useBookDetail(id);

  if (error) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to dashboard
        </Link>

        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm">
          <div className="font-medium">Couldn’t load this book.</div>
          <div className="mt-1 text-gray-700">{error}</div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to dashboard
        </Link>

        <div className="mt-4 rounded border p-4 text-sm text-gray-600">Loading…</div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← Back to dashboard
          </Link>
          <h1 className="text-2xl font-semibold mt-2">{data.shelf_item.title}</h1>
          <p className="text-gray-600">{data.shelf_item.author}</p>
          {data.shelf_item.shelf ? <p className="text-xs text-gray-500 mt-1">Shelf: {data.shelf_item.shelf}</p> : null}
        </div>
      </div>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Read Next</h2>
        <p className="text-sm text-gray-600 mt-1">
          {rankLoading ? (
            <span>Calculating rank…</span>
          ) : rank ? (
            <span>
              When sorting by Read Next, this item is ranked <span className="font-medium">#{rank}</span>.
            </span>
          ) : (
            <span>Rank unavailable (not found in the dashboard list).</span>
          )}
        </p>

        <div className="mt-3 text-sm">
          <div>
            <span className="font-medium">Tier:</span> {data.read_next.tier.replace("_", " ")}
          </div>
          <div className="mt-1">
            <span className="font-medium">Score:</span> {data.read_next.score.toFixed(1)}
          </div>
          {data.read_next.best_format ? (
            <div className="mt-1">
              <span className="font-medium">Best format:</span> {data.read_next.best_format}
            </div>
          ) : null}

          <div className="mt-3">
            <div className="font-medium">Why it ranks here</div>
            <ul className="list-disc pl-5 mt-2 text-gray-700">
              {data.read_next.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <div className="text-xs text-gray-500 mt-3 whitespace-pre-line" title={tooltip}>
              Tip: hover for the full scoring summary.
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Availability</h2>
        {data.availability.length ? (
          <ul className="mt-2 space-y-2">
            {data.availability.map((a) => (
              <li key={a.format} className="text-sm">
                <div className="flex items-center justify-between">
                  <div className="capitalize">
                    {a.format}: {a.status.replace("_", " ")}
                  </div>
                  {a.deep_link ? (
                    <a href={a.deep_link} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {a.status === "available" && a.copies_available != null ? <span>{a.copies_available} available</span> : null}
                  {a.status === "hold" && a.holds != null ? <span>{a.holds} holds</span> : null}
                  {a.last_checked_at ? <span className="ml-2">Checked: {new Date(a.last_checked_at).toLocaleString()}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600 mt-2">No availability data yet.</p>
        )}
      </section>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Catalog match</h2>
        {data.match ? (
          <div className="mt-2 text-sm">
            <div>
              <span className="font-medium">Provider:</span> {data.match.catalog_item.provider}
            </div>
            <div className="mt-1">
              <span className="font-medium">Confidence:</span> {(data.match.confidence * 100).toFixed(0)}%
            </div>
            <div className="mt-2">
              <span className="font-medium">Catalog title:</span> {data.match.catalog_item.title}
            </div>
            <div className="text-xs text-gray-600 mt-2">
              Evidence:
              <pre className="mt-1 p-2 bg-gray-50 rounded overflow-auto">{JSON.stringify(data.match.evidence, null, 2)}</pre>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 mt-2">No match found.</p>
        )}
      </section>
    </main>
  );
}
