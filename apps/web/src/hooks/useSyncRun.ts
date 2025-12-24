"use client";

import { getSyncRun, startAvailabilityRefresh, subscribeSyncRun, SyncRun } from "@/lib/syncRuns";
import { useCallback, useEffect, useRef, useState } from "react";

export function useSyncRun() {
  const [run, setRun] = useState<SyncRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<null | (() => void)>(null);

  const stop = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    stop();

    const created = await startAvailabilityRefresh();
    setRun(created);

    unsubscribeRef.current = subscribeSyncRun(created.id, (evt) => {
      const t = evt.type;
      if (t === "progress") {
        setRun((r) =>
          r
            ? {
                ...r,
                status: "running",
                progress_current: evt.payload.current,
                progress_total: evt.payload.total,
              }
            : r
        );
      }
      if (t === "failed") {
        setRun((r) => (r ? { ...r, status: "failed", error_message: evt.payload.message } : r));
        stop();
      }
      if (t === "succeeded") {
        setRun((r) => (r ? { ...r, status: "succeeded", progress_current: r.progress_total } : r));
        stop();
      }
    });

    // Fallback polling in case SSE disconnects
    const poll = async () => {
      try {
        const fresh = await getSyncRun(created.id);
        setRun(fresh);
        if (fresh.status === "succeeded" || fresh.status === "failed") return;
        setTimeout(poll, 2500);
      } catch {
        setTimeout(poll, 2500);
      }
    };

    setTimeout(poll, 2500);
  }, [stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { run, error, start, stop };
}