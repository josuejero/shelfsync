"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

type UnreadCountOut = { unread: number };

export function NotificationBell() {
  const [unread, setUnread] = useState<number>(0);
  const startedRef = useRef(false);

  async function loadCount() {
    try {
      const res = await apiFetch<UnreadCountOut>("/v1/notifications/unread-count");
      setUnread(res.unread);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let alive = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    loadCount();

    // Live updates (SSE). If it fails, fall back to polling.
    const url = `/api/proxy/sse?path=${encodeURIComponent("/v1/notifications/events")}`;
    const es = new EventSource(url);

    es.onmessage = (evt) => {
      if (!alive) return;
      try {
        const msg = JSON.parse(evt.data);
        if (msg?.type === "notification") {
          setUnread((n) => n + 1);
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      if (!alive) return;
      es.close();

      // fallback polling every 30s
      if (!pollTimer) {
        pollTimer = setInterval(() => {
          if (!alive) return;
          loadCount();
        }, 30_000);
      }
    };

    return () => {
      alive = false;
      es.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      className="relative inline-flex items-center justify-center rounded border px-3 py-2 text-sm hover:bg-gray-50"
      aria-label="Notifications"
      title="Notifications"
    >
      <span aria-hidden>🔔</span>
      {unread > 0 ? (
        <span className="absolute -top-2 -right-2 min-w-[1.25rem] h-5 px-1 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">
          {unread}
        </span>
      ) : null}
    </Link>
  );
}