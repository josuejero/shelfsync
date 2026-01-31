import type { Env, SyncRunRow } from "../types";
import { publishSyncRunEvent } from "../syncRunEvents";
import {
	fetchSyncRunRow,
	markSyncRunFailed,
	markSyncRunSucceeded,
	updateShelfSourceSyncStatus,
	updateSyncRunProgress,
} from "../db/syncRuns";

export const notifyProgress = async (
	env: Env,
	runId: string,
	current: number,
	total?: number,
) => {
	const payload: Record<string, unknown> = { current };
	if (typeof total === "number") {
		payload.total = total;
	}
	await publishSyncRunEvent(env.SYNC_RUN_EVENTS, runId, "progress", payload);
};

export const notifySuccess = async (env: Env, runId: string) => {
	const payload: Record<string, unknown> = {};
	const row = await fetchSyncRunRow(env.DB, runId);
	if (row) {
		payload.current = row.progress_current;
		payload.total = row.progress_total;
	}
	await publishSyncRunEvent(env.SYNC_RUN_EVENTS, runId, "succeeded", payload);
};

export const notifyFailure = async (env: Env, runId: string, message: string) => {
	const payload: Record<string, unknown> = { message };
	const row = await fetchSyncRunRow(env.DB, runId);
	if (row) {
		payload.current = row.progress_current;
		payload.total = row.progress_total;
	}
	await publishSyncRunEvent(env.SYNC_RUN_EVENTS, runId, "failed", payload);
};

export const runAvailabilityRefreshJob = async (env: Env, run: SyncRunRow) => {
	await updateSyncRunProgress(env.DB, run.id, 0, { total: 1 });
	await notifyProgress(env, run.id, 0, 1);
	await updateSyncRunProgress(env.DB, run.id, 1);
	await notifyProgress(env, run.id, 1, 1);
	await markSyncRunSucceeded(env.DB, run.id);
	await notifySuccess(env, run.id);
};

export const runShelfSourceSyncJob = async (env: Env, run: SyncRunRow, sourceId: string) => {
	const source = await env.DB
		.prepare("SELECT user_id FROM shelf_sources WHERE id = ? LIMIT 1")
		.bind(sourceId)
		.first<{ user_id: string }>();

	if (!source || source.user_id !== run.user_id) {
		throw new Error("Shelf source not found");
	}

	await updateSyncRunProgress(env.DB, run.id, 0, { total: 1 });
	await updateShelfSourceSyncStatus(env.DB, sourceId, "running");
	await updateShelfSourceSyncStatus(env.DB, sourceId, "succeeded");
	await updateSyncRunProgress(env.DB, run.id, 0, { total: 1 });
	await notifyProgress(env, run.id, 0, 1);
	await updateSyncRunProgress(env.DB, run.id, 1);
	await notifyProgress(env, run.id, 1, 1);
	await markSyncRunSucceeded(env.DB, run.id);
	await notifySuccess(env, run.id);
};
