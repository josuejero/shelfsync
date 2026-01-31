import type { D1Database, Queue } from "@cloudflare/workers-types";
import type { QueueMessage, SyncRunRow, SyncRunResponse } from "../types";

export const mapSyncRunRow = (row: SyncRunRow): SyncRunResponse => ({
	id: row.id,
	kind: row.kind,
	status: row.status,
	progress_current: row.progress_current,
	progress_total: row.progress_total,
	error_message: row.error_message,
	started_at: row.started_at,
	finished_at: row.finished_at,
	created_at: row.created_at,
	updated_at: row.updated_at,
});

export const fetchSyncRunRow = async (db: D1Database, runId: string): Promise<SyncRunRow | null> => {
	const row = await db
		.prepare(
			"SELECT id, user_id, kind, status, progress_current, progress_total, error_message, started_at, finished_at, created_at, updated_at FROM sync_runs WHERE id = ? LIMIT 1",
		)
		.bind(runId)
		.first<SyncRunRow>();
	return row ?? null;
};

export const createSyncRun = async (db: D1Database, userId: string, kind: string) => {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO sync_runs (id, user_id, kind, status, progress_current, progress_total, created_at, updated_at, started_at) VALUES (?, ?, ?, 'running', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
		)
		.bind(id, userId, kind)
		.run();
	const row = await fetchSyncRunRow(db, id);
	if (!row) {
		throw new Error("unable to create sync run");
	}
	return row;
};

export const updateSyncRunProgress = async (
	db: D1Database,
	runId: string,
	current: number,
	options?: { total?: number },
) => {
	const updates = ["progress_current = ?", "updated_at = CURRENT_TIMESTAMP"];
	const values: unknown[] = [current];
	if (typeof options?.total === "number") {
		updates.push("progress_total = ?");
		values.push(options.total);
	}
	values.push(runId);
	await db
		.prepare(`UPDATE sync_runs SET ${updates.join(", ")} WHERE id = ?`)
		.bind(...values)
		.run();
};

export const markSyncRunSucceeded = async (db: D1Database, runId: string) => {
	await db
		.prepare(
			"UPDATE sync_runs SET status = 'succeeded', progress_current = progress_total, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		)
		.bind(runId)
		.run();
};

export const markSyncRunFailed = async (db: D1Database, runId: string, message: string) => {
	await db
		.prepare(
			"UPDATE sync_runs SET status = 'failed', error_message = ?, progress_current = progress_total, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		)
		.bind(message, runId)
		.run();
};

export const updateShelfSourceSyncStatus = async (
	db: D1Database,
	sourceId: string,
	status: "running" | "succeeded" | "failed",
	errorMessage?: string | null,
) => {
	await db
		.prepare(
			"UPDATE shelf_sources SET last_synced_at = CURRENT_TIMESTAMP, last_sync_status = ?, last_sync_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		)
		.bind(status, errorMessage ?? null, sourceId)
		.run();
};

export const enqueueSyncMessage = async (queue: Queue | undefined, message: QueueMessage) => {
	if (!queue) {
		throw new Error("sync queue is not configured");
	}
	await queue.send(message);
};
