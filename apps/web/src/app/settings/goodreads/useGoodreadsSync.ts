"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { ImportSummary, ShelfItem, ShelfSource } from "./types";

type HookState = {
  rssUrl: string;
  shelf: string;
  rssSource: ShelfSource | null;
  items: ShelfItem[];
  summary: ImportSummary | null;
  csvFile: File | null;
  busy: boolean;
  error: string | null;
};

const defaultState: HookState = {
  rssUrl: "http://localhost:4010/mock/goodreads/shelf/demo/read/rss",
  shelf: "to-read",
  rssSource: null,
  items: [],
  summary: null,
  csvFile: null,
  busy: false,
  error: null,
};

export function useGoodreadsSync() {
  const [state, setState] = useState(defaultState);

  const setField = (patch: Partial<HookState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const refreshItems = async (sourceId?: string) => {
    const qs = new URLSearchParams();
    if (sourceId) qs.set("source_id", sourceId);
    const rows = await apiFetch<ShelfItem[]>(`/v1/shelf-items?${qs.toString()}`);
    setField({ items: rows });
  };

  const connectRss = async () => {
    setField({ busy: true, error: null, summary: null });
    try {
      const src = await apiFetch<ShelfSource>("/v1/shelf-sources/rss", {
        method: "POST",
        body: JSON.stringify({ rss_url: state.rssUrl, shelf: state.shelf, sync_now: true }),
      });
      setField({ rssSource: src });
      setTimeout(() => refreshItems(src.id).catch(() => undefined), 750);
    } catch (e: any) {
      setField({ error: e?.message || String(e) });
    } finally {
      setField({ busy: false });
    }
  };

  const syncNow = async () => {
    if (!state.rssSource) return;
    setField({ busy: true, error: null });
    try {
      await apiFetch<{ job_id: string }>(`/v1/shelf-sources/${state.rssSource.id}/sync`, {
        method: "POST",
      });
      setTimeout(() => refreshItems(state.rssSource?.id).catch(() => undefined), 750);
    } catch (e: any) {
      setField({ error: e?.message || String(e) });
    } finally {
      setField({ busy: false });
    }
  };

  const disconnect = async () => {
    if (!state.rssSource) return;
    setField({ busy: true, error: null });
    try {
      await apiFetch<void>(`/v1/shelf-sources/${state.rssSource.id}`, { method: "DELETE" });
      setField({ rssSource: null, items: [] });
    } catch (e: any) {
      setField({ error: e?.message || String(e) });
    } finally {
      setField({ busy: false });
    }
  };

  const uploadCsv = async () => {
    if (!state.csvFile) return;
    setField({ busy: true, error: null, summary: null });
    try {
      const fd = new FormData();
      fd.append("file", state.csvFile);
      const res = await apiFetch<ImportSummary>("/v1/shelf-sources/csv", {
        method: "POST",
        body: fd,
      });
      setField({ summary: res });
      await refreshItems();
    } catch (e: any) {
      setField({ error: e?.message || String(e) });
    } finally {
      setField({ busy: false });
    }
  };

  useEffect(() => {
    refreshItems().catch(() => undefined);
  }, []);

  return {
    state,
    setField,
    refreshItems,
    connectRss,
    syncNow,
    disconnect,
    uploadCsv,
  };
}
