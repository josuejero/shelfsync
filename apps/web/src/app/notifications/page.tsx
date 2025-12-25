"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthGuard } from "@/components/AuthGuard";
import { apiFetch } from "@/lib/api";

type NotificationOut = {
  id: string;
  created_at: string;
  read_at: string | null;
  shelf_item_id: string;
  title: string;
  author: string | null;
  format: string;
  old_status: string;
  new_status: string;
  deep_link: string | null;
};

type NotificationListOut = {
  page: { total: number; limit: number; offset: number };
  items: NotificationOut[];
};

export default function NotificationsPage() {
  const [data, setData] = useState<NotificationListOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<NotificationListOut>(
        `/v1/notifications?limit=100&offset=0&unread_only=${unreadOnly ? "true" : "false"}`
      );
      setData(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  async function markRead(id: string) {
    await apiFetch<void>(`/v1/notifications/${id}/read`, { method: "POST" });
    await load();
  }

  async function markAllRead() {
    await apiFetch<{ updated: number }>(`/v1/notifications/mark-all-read`, { method: "POST" });
    await load();
  }

  return (
    <AuthGuard>
      <main className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
              ← Back to dashboard
            </Link>
            <h1 className="text-2xl font-semibold mt-2">Notifications</h1>
            <p className="text-sm text-gray-600">Items that became available recently.</p>
          </div>
          <button
            onClick={markAllRead}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Mark all read
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Show unread only
          </label>
        </div>

        {loading ? <div className="mt-6 text-sm text-gray-600">Loading…</div> : null}
        {error ? <div className="mt-6 text-sm text-red-600">{error}</div> : null}

        {!loading && data && data.items.length === 0 ? (
          <div className="mt-6 rounded border p-4 text-sm text-gray-600">No notifications yet.</div>
        ) : null}

        <div className="mt-6 space-y-3">
          {data?.items.map((n) => (
            <div key={n.id} className="rounded border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-500">
                    {new Date(n.created_at).toLocaleString()} • {n.format}
                  </div>
                  <div className="mt-1 font-medium">
                    <Link href={`/books/${n.shelf_item_id}`} className="hover:underline">
                      {n.title}
                    </Link>
                  </div>
                  {n.author ? <div className="text-sm text-gray-600">{n.author}</div> : null}

                  <div className="mt-2 text-sm">
                    <span className="font-medium">Status:</span> {n.old_status} → {n.new_status}
                  </div>

                  {n.deep_link ? (
                    <div className="mt-2">
                      <a
                        href={n.deep_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Open in library
                      </a>
                    </div>
                  ) : null}
                </div>

                {n.read_at ? (
                  <span className="text-xs text-gray-500">Read</span>
                ) : (
                  <button
                    onClick={() => markRead(n.id)}
                    className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </AuthGuard>
  );
}