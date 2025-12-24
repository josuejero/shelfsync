import { apiFetch } from "@/lib/api";

export type SyncRun = {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress_current: number;
  progress_total: number;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
};

export async function startAvailabilityRefresh(): Promise<SyncRun> {
  return apiFetch<SyncRun>("/v1/sync-runs", {
    method: "POST",
    body: JSON.stringify({ kind: "availability_refresh" }),
  });
}

export async function getSyncRun(id: string): Promise<SyncRun> {
  return apiFetch<SyncRun>(`/v1/sync-runs/${id}`);
}

export function subscribeSyncRun(id: string, onEvent: (evt: any) => void) {
  const es = new EventSource(`/api/proxy/sse?path=/v1/sync-runs/${id}/events`);

  es.addEventListener("sync", (e) => {
    try {
      onEvent(JSON.parse((e as MessageEvent).data));
    } catch {
      // ignore
    }
  });

  es.onerror = () => {
    // Let caller decide fallback.
  };

  return () => es.close();
}