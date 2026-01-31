import type { Hono } from "hono";
import { jsonResponse } from "../utils/http";
import { requireAuthUser } from "../auth/session";
import { createLegacyNotificationStream } from "../streams/notifications";
import { createLegacySyncRunStream } from "../streams/syncRuns";
import { NOTIFICATION_EVENT_HEADER, NOTIFICATION_EVENT_PATH } from "../notificationEvents";
import { SYNC_RUN_EVENT_HEADER, SYNC_RUN_EVENT_PATH } from "../syncRunEvents";
import { fetchSyncRunRow } from "../db/syncRuns";
import type { Env } from "../types";

export const registerEventRoutes = (app: Hono<{ Bindings: Env }>) => {
	app.get("/v1/notifications/events", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}

		if (!c.env.NOTIFICATION_EVENTS) {
			return createLegacyNotificationStream(c.env.DB, user.id, c.req.signal);
		}

		const durableId = c.env.NOTIFICATION_EVENTS.idFromName(user.id);
		const stub = c.env.NOTIFICATION_EVENTS.get(durableId);
		const doRequest = new Request(NOTIFICATION_EVENT_PATH, {
			method: "GET",
			headers: {
				[NOTIFICATION_EVENT_HEADER]: user.id,
			},
			signal: c.req.signal,
		});
		return stub.fetch(doRequest);
	});

	app.get("/v1/sync-runs/:id/events", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}

		const runId = c.req.param("id");
		if (!runId) {
			return jsonResponse({ ok: false, error: "Run ID is required" }, { status: 400 });
		}

		const initialRow = await fetchSyncRunRow(c.env.DB, runId);
		if (!initialRow || initialRow.user_id !== user.id) {
			return jsonResponse({ ok: false, error: "Run not found" }, { status: 404 });
		}

		if (!c.env.SYNC_RUN_EVENTS) {
			return createLegacySyncRunStream(c.env.DB, runId, initialRow, c.req.signal);
		}

		const durableId = c.env.SYNC_RUN_EVENTS.idFromName(runId);
		const stub = c.env.SYNC_RUN_EVENTS.get(durableId);
		const doRequest = new Request(SYNC_RUN_EVENT_PATH, {
			method: "GET",
			headers: {
				[SYNC_RUN_EVENT_HEADER]: runId,
			},
			signal: c.req.signal,
		});
		return stub.fetch(doRequest);
	});
};
