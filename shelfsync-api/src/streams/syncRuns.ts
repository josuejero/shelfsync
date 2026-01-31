import type { D1Database } from "@cloudflare/workers-types";
import type { SyncRunRow } from "../types";

export const LEGACY_SSE_HEADERS = {
	"content-type": "text/event-stream",
	"cache-control": "no-cache",
	Connection: "keep-alive",
} as const;

const encoder = new TextEncoder();

export const createLegacySyncRunStream = (
	db: D1Database,
	runId: string,
	initialRow: SyncRunRow,
	signal?: AbortSignal,
) => {
	const stream = new ReadableStream({
		start(controller) {
			const sendEvent = (type: string, payload: Record<string, unknown>) => {
				const data = JSON.stringify({ type, payload });
				controller.enqueue(encoder.encode(`event: sync\ndata: ${data}\n\n`));
			};
			let lastUpdated = initialRow.updated_at;
			const emitRowState = (row: SyncRunRow) => {
				const type = row.status === "running" ? "progress" : row.status;
				const payload =
					type === "progress"
						? {
								current: row.progress_current,
								total: row.progress_total,
						  }
						: type === "failed"
						? { message: row.error_message ?? "failed" }
						: {
								current: row.progress_current,
								total: row.progress_total,
						  };
				sendEvent(type, payload);
				return type;
			};
			const initialType = emitRowState(initialRow);
			if (initialType !== "running") {
				controller.close();
				return;
			}
			const poller = setInterval(async () => {
				const latest = await db
					.prepare(
						"SELECT id, user_id, kind, status, progress_current, progress_total, error_message, started_at, finished_at, created_at, updated_at FROM sync_runs WHERE id = ? LIMIT 1",
					)
					.bind(runId)
					.first<SyncRunRow>();
				if (!latest || latest.updated_at === lastUpdated) {
					return;
				}
				lastUpdated = latest.updated_at;
				const type = emitRowState(latest);
				if (type === "failed" || type === "succeeded") {
					clearInterval(poller);
					controller.close();
				}
			}, 2500);
			signal?.addEventListener("abort", () => {
				clearInterval(poller);
				controller.close();
			});
		},
	});

	return new Response(stream, { headers: LEGACY_SSE_HEADERS });
};
