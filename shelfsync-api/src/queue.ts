import type { ExportedHandler } from "@cloudflare/workers-types";
import type { Env, QueueMessage } from "./types";
import {
	fetchSyncRunRow,
	markSyncRunFailed,
	updateShelfSourceSyncStatus,
} from "./db/syncRuns";
import {
	notifyFailure,
	runAvailabilityRefreshJob,
	runShelfSourceSyncJob,
} from "./jobs/sync";

const processQueueMessage = async (env: Env, message: QueueMessage) => {
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

export const queue: ExportedHandler<Env, QueueMessage>["queue"] = (batch, env, ctx) => {
	const task = Promise.all(
		batch.messages.map(async (message) => {
			try {
				await processQueueMessage(env, message.body);
			} catch (error) {
				console.error("[sync queue] task failed", error);
				const { runId, kind } = message.body ?? {};
				if (runId) {
					const errMsg = error instanceof Error ? error.message : "job failed";
					await markSyncRunFailed(env.DB, runId, errMsg);
					await notifyFailure(env, runId, errMsg);
					if (kind === "shelf_source_sync" && message.body?.payload?.sourceId) {
						await updateShelfSourceSyncStatus(
							env.DB,
							message.body.payload.sourceId,
							"failed",
							errMsg,
						);
					}
				}
			}
		}),
	);
	ctx.waitUntil(task);
	return task;
};
