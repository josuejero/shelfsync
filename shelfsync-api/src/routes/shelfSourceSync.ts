import type { Hono } from "hono";
import { jsonResponse } from "../utils/http";
import { requireAuthUser } from "../auth/session";
import { fetchShelfSourceById } from "../db/shelfSources";
import {
	createSyncRun,
	updateShelfSourceSyncStatus,
} from "../db/syncRuns";
import { notifyProgress } from "../jobs/sync";
import { scheduleSyncJob } from "../jobs/scheduler";
import type { Env, SyncRunRow } from "../types";

export const registerShelfSourceSyncRoutes = (app: Hono<{ Bindings: Env }>) => {
	app.post("/v1/shelf-sources/:id/sync", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}

		const sourceId = c.req.param("id");
		if (!sourceId) {
			return jsonResponse({ ok: false, error: "Source ID is required" }, { status: 400 });
		}

		const source = await fetchShelfSourceById(c.env.DB, user.id, sourceId);
		if (!source) {
			return jsonResponse({ ok: false, error: "Source not found" }, { status: 404 });
		}

		if (source.source_type !== "rss") {
			return jsonResponse(
				{ ok: false, error: "Only RSS sources can be synced" },
				{ status: 400 },
			);
		}

		await updateShelfSourceSyncStatus(c.env.DB, sourceId, "running");

		let run: SyncRunRow;
		try {
			run = await createSyncRun(c.env.DB, user.id, "shelf_source_sync");
		} catch (error) {
			console.error("[sync-run] failed to create run", error);
			await updateShelfSourceSyncStatus(
				c.env.DB,
				sourceId,
				"failed",
				"failed to create run",
			);
			return jsonResponse({ ok: false, error: "Unable to start sync run" }, { status: 500 });
		}

		await notifyProgress(c.env, run.id, run.progress_current, run.progress_total);

		scheduleSyncJob(c, {
			runId: run.id,
			userId: user.id,
			kind: "shelf_source_sync",
			payload: { sourceId },
		});

		return jsonResponse({ ok: true, data: { job_id: run.id } }, { status: 202 });
	});
};
