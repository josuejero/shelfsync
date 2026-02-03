import type { Hono } from "hono";
import { jsonResponse } from "../utils/http";
import { requireAuthUser } from "../auth/session";
import {
	createSyncRun,
	fetchSyncRunRow,
	mapSyncRunRow,
} from "../db/syncRuns";
import { notifyProgress } from "../jobs/sync";
import { scheduleSyncJob } from "../jobs/scheduler";
import type { Env } from "../types";

export const registerSyncRunRoutes = (app: Hono<{ Bindings: Env }>) => {
	app.post("/v1/sync-runs/availability/refresh", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}

		let run;
		try {
			run = await createSyncRun(c.env.DB, user.id, "availability_refresh");
		} catch (error) {
			console.error("[sync-run] failed to create run", error);
			return jsonResponse({ ok: false, error: "Unable to start sync run" }, { status: 500 });
		}

		await notifyProgress(c.env, run.id, run.progress_current, run.progress_total);

		scheduleSyncJob(c, {
			runId: run.id,
			userId: user.id,
			kind: "availability_refresh",
		});

		return jsonResponse({ ok: true, data: { job_id: run.id } }, { status: 202 });
	});

	app.get("/v1/sync-runs/:id", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}

		const runId = c.req.param("id");
		if (!runId) {
			return jsonResponse({ ok: false, error: "Run ID is required" }, { status: 400 });
		}

		const row = await fetchSyncRunRow(c.env.DB, runId);
		if (!row || row.user_id !== user.id) {
			return jsonResponse({ ok: false, error: "Run not found" }, { status: 404 });
		}

		return jsonResponse({ ok: true, data: { run: mapSyncRunRow(row) } });
	});
};
