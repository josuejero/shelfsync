"use client";

import { compareReadNext, readNextTooltip, type ReadNext } from "@/lib/readNext";
import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { BookDetail, DashboardResponse } from "./types";

export function useBookDetail(id: string) {
  const [data, setData] = useState<BookDetail | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [rankLoading, setRankLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setRank(null);
    setError(null);

    (async () => {
      try {
        const book = await apiFetch<BookDetail>(`/v1/books/${id}`);
        if (!alive) return;
        setData(book);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        return;
      }

      setRankLoading(true);
      try {
        const dash = await apiFetch<DashboardResponse>(`/v1/dashboard?limit=500&offset=0&sort=read_next`);
        if (!alive) return;
        const ranked = [...dash.items].sort(compareReadNext);
        const idx = ranked.findIndex((r) => r.shelf_item_id === id);
        setRank(idx >= 0 ? idx + 1 : null);
      } catch {
        if (!alive) return;
        setRank(null);
      } finally {
        if (alive) setRankLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const tooltip = useMemo(() => (data ? readNextTooltip(data.read_next) : ""), [data]);
  return { data, rank, rankLoading, error, tooltip };
}
