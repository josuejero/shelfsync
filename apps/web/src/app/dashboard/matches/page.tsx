"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

type Availability = {
  format: string;
  status: string;
  copies_available: number | null;
  copies_total: number | null;
  holds: number | null;
  deep_link: string | null;
  last_checked_at: string;
};

type MatchRow = {
  shelf_item_id: string;
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
  availability: Availability[];
};

type JobStatus = {
  id: string;
  status: string;
  result: Record<string, unknown> | null;
  exc_info: string | null;
};

export default function MatchesPage() {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadRows() {
    const data = await apiFetch<MatchRow[]>("/v1/matches");
    setRows(data);
  }

  useEffect(() => {
    loadRows().catch((e) => setError(String(e)));
  }, []);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const { job_id } = await apiFetch<{ job_id: string }>("/v1/matching/refresh", {
        method: "POST",
      });

      // Poll status. Keep it simple; a websocket can come later.
      for (let i = 0; i < 30; i++) {
        const st = await apiFetch<JobStatus>(`/v1/matching/refresh/${job_id}`);
        setJob(st);
        if (st.status === "finished" || st.status === "failed") break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      await loadRows();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Matches</h1>
        <button
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh matches"}
        </button>
      </div>

      {error && <div className="p-3 rounded bg-red-50 text-red-800">{error}</div>}

      {job && (
        <div className="p-3 rounded bg-gray-50 text-sm">
          <div>
            Job: <span className="font-mono">{job.id}</span> ({job.status})
          </div>
          {job.exc_info && <div className="text-red-700">{job.exc_info}</div>}
          {job.result && <pre className="mt-2 overflow-auto">{JSON.stringify(job.result, null, 2)}</pre>}
        </div>
      )}

      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="text-gray-600">No matches yet. Import shelf items (Phase 2) and refresh.</div>
        ) : (
          rows.map((r) => (
            <div key={r.shelf_item_id} className="border rounded p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{r.catalog_item.title}</div>
                  {r.catalog_item.author && <div className="text-sm text-gray-600">{r.catalog_item.author}</div>}
                  <div className="text-xs text-gray-500">
                    {r.method} · confidence {r.confidence.toFixed(2)} · {r.catalog_item.provider}:{r.catalog_item.provider_item_id}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {r.availability.map((a) => (
                  <div key={a.format} className="rounded bg-gray-50 p-3 text-sm">
                    <div className="font-medium">{a.format}</div>
                    <div>Status: {a.status}</div>
                    {typeof a.copies_total === "number" && (
                      <div>
                        Copies: {a.copies_available ?? "?"}/{a.copies_total}
                      </div>
                    )}
                    {typeof a.holds === "number" && <div>Holds: {a.holds}</div>}
                    {a.deep_link && (
                      <a className="text-blue-700 underline" href={a.deep_link} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-gray-700">Why this match?</summary>
                <pre className="mt-2 overflow-auto text-xs bg-gray-50 p-3 rounded">{JSON.stringify(r.evidence, null, 2)}</pre>
              </details>
            </div>
          ))
        )}
      </div>
    </div>
  );
}