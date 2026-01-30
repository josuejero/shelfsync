"use client";

import { compareReadNext } from "@/lib/readNext";
import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { DashboardResponse, DashboardRow, FilterKey, SortKey } from "./types";

export const DEFAULT_SORT: SortKey = "read_next";
export const DEFAULT_FILTER: FilterKey = "all";

export function availabilityStatus(row: DashboardRow): FilterKey {
  if (!row.match) return "not_owned";
  if (row.availability.some((a) => a.status === "available")) return "available";
  if (row.availability.some((a) => a.status === "hold")) return "hold";
  return "not_owned";
}

export function availabilityRank(row: DashboardRow): number {
  const status = availabilityStatus(row);
  if (status === "available") return 3;
  if (status === "hold") return 2;
  if (status === "not_owned") return 1;
  return 0;
}

export function useDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await apiFetch<DashboardResponse>(`/v1/dashboard?limit=200&offset=0&sort=read_next`);
        if (!alive) return;
        setData(res);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];

    const rows = [...data.items];
    rows.sort((a, b) => {
      if (DEFAULT_SORT === "read_next") return compareReadNext(a, b);
      if (DEFAULT_SORT === "availability") {
        const ra = availabilityRank(a);
        const rb = availabilityRank(b);
        if (ra !== rb) return rb - ra;
        return a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title);
    });

    return rows.filter((r) => (DEFAULT_FILTER === "all" ? true : availabilityStatus(r) === DEFAULT_FILTER));
  }, [data]);

  return { data, error, filtered };
}
