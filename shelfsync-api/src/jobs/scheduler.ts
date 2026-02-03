import type { Context } from "hono";
import type { Env, QueueMessage } from "../types";
import {
	fetchSyncRunRow,
	markSyncRunFailed,
	updateShelfSourceSyncStatus,
} from "../db/syncRuns";
import {
	notifyFailure,
	runAvailabilityRefreshJob,
	runShelfSourceSyncJob,
} from "./sync";

const processSyncJobMessage = async (env: Env, message: QueueMessage) => {
	const run = await fetchSyncRunRow(env.DB, message.runId);
	if (!run || run.user_id !== message.userId) {
		throw new Error("Sync run not found");
	}

	if (message.kind === "availability_refresh") {
		return runAvailabilityRefreshJob(env, run);
	}

	if (message.kind === "shelf_source_sync") {
		const sourceId = message.payload?.sourceId;
		if (!sourceId) {
			throw new Error("Missing source ID");
		}
		return runShelfSourceSyncJob(env, run, sourceId);
	}

	throw new Error(`Unknown sync kind: ${message.kind}`);
};

const handleSyncJobMessage = async (env: Env, message: QueueMessage) => {
	try {
		await processSyncJobMessage(env, message);
	} catch (error) {
		console.error("[sync job] task failed", error);
		const { runId, kind } = message;
		if (!runId) {
			return;
		}
		const errMsg = error instanceof Error ? error.message : "job failed";
		await markSyncRunFailed(env.DB, runId, errMsg);
		await notifyFailure(env, runId, errMsg);
		if (kind === "shelf_source_sync" && message.payload?.sourceId) {
			await updateShelfSourceSyncStatus(
				env.DB,
				message.payload.sourceId,
				"failed",
				errMsg,
			);
		}
	}
};

export const scheduleSyncJob = (
	context: Context<{ Bindings: Env }>,
	message: QueueMessage,
) => {
	const task = handleSyncJobMessage(context.env, message);
	try {
		context.executionCtx.waitUntil(task);
	} catch {
		void task;
	}
	return task;
};
