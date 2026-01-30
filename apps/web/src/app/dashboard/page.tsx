"use client";

import Link from "next/link";

import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import { readNextTooltip } from "@/lib/readNext";
import { useDashboard, availabilityStatus } from "./useDashboard";

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardInner />
    </AuthGuard>
  );
}

function DashboardInner() {
  const { data, error, filtered } = useDashboard();

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-600">
            Sorted by <span className="font-medium">Read Next</span>. This ranking prioritizes items available now, then
            shorter hold queues, using your format preferences.
          </p>
          <p className="text-xs text-gray-500 mt-1">Tip: hover ⓘ to see the explanation (tier, format, queue details).</p>
        </div>

        <NotificationBell />

        <Link href="/settings" className="px-3 py-2 rounded border text-sm hover:bg-gray-50">
          Settings
        </Link>
      </div>

      {error ? (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm">
          <div className="font-medium">Couldn’t load your dashboard.</div>
          <div className="mt-1 text-gray-700">{error}</div>
        </div>
      ) : null}

      {!data && !error ? <div className="mt-4 rounded border p-4 text-sm text-gray-600">Loading…</div> : null}

      {data ? (
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
                        <span className="text-xs text-gray-500 cursor-help" title={rnTitle} aria-label="Read Next explanation">
                          ⓘ
                        </span>
                      </div>
                      {row.author ? <div className="text-gray-600">{row.author}</div> : null}
                      {row.needs_fuzzy_match ? <div className="text-xs text-amber-700 mt-1">Needs fuzzy match</div> : null}
                    </td>

                    <td className="p-3">{row.shelf ?? "—"}</td>

                    <td className="p-3">
                      <div className="capitalize">{status.replace("_", " ")}</div>
                      {row.availability.length ? (
                        <div className="text-xs text-gray-600 mt-1">
                          {row.availability
                            .map((a) => {
                              const bits = [a.format, a.status];
                              if (a.status === "available" && a.copies_available != null) bits.push(`${a.copies_available} available`);
                              if (a.status === "hold" && a.holds != null) bits.push(`${a.holds} holds`);
                              return bits.join(" • ");
                            })
                            .join(" | ")}
                        </div>
                      ) : null}
                    </td>

                    <td className="p-3">
                      <div className="capitalize">{row.read_next.tier.replace("_", " ")}</div>
                      <div className="text-xs text-gray-600 mt-1">Score: {row.read_next.score.toFixed(1)}</div>
                      {row.read_next.best_format ? <div className="text-xs text-gray-600">Best: {row.read_next.best_format}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-6 text-xs text-gray-600">
        <p>
          <span className="font-medium">How Read Next works:</span> Available now → Holds → Not owned. Within a tier, your
          preferred format order matters, and hold queue size breaks ties.
        </p>
      </div>
    </main>
  );
}
