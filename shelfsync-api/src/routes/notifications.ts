import type { Hono } from "hono";
import { jsonResponse } from "../utils/http";
import { parseLimitParam, parseOffsetParam, parseBooleanQuery } from "../utils/query";
import { requireAuthUser } from "../auth/session";
import {
	countUnreadNotifications,
	insertNotificationEvent,
	listNotificationsForUser,
	markAllNotificationsRead,
	markNotificationRead,
	resolveShelfItemForNotification,
} from "../db/notifications";
import { publishNotificationEvent } from "../notificationEvents";
import type { Env } from "../types";

export const registerNotificationRoutes = (app: Hono<{ Bindings: Env }>) => {
	app.get("/v1/notifications", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const limit = parseLimitParam(c.req.query("limit"));
		const offset = parseOffsetParam(c.req.query("offset"));
		const unreadOnly = parseBooleanQuery(c.req.query("unread_only"));
		const { total, rows } = await listNotificationsForUser(
			c.env.DB,
			user.id,
			limit,
			offset,
			unreadOnly,
		);
		const items = rows.map((row) => ({
			id: row.id,
			created_at: row.created_at,
			read_at: row.read_at,
			shelf_item_id: row.shelf_item_id,
			title: row.title,
			author: row.author,
			format: row.format,
			old_status: row.old_status,
			new_status: row.new_status,
			deep_link: row.deep_link,
		}));
		return jsonResponse({
			ok: true,
			data: {
				page: { total, limit, offset },
				items,
			},
		});
	});

	app.get("/v1/notifications/unread-count", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const unread = await countUnreadNotifications(c.env.DB, user.id);
		return jsonResponse({ ok: true, data: { unread } });
	});

	app.post("/v1/notifications/:id/read", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const notificationId = c.req.param("id");
		if (!notificationId) {
			return jsonResponse({ ok: false, error: "Notification ID is required" }, { status: 400 });
		}
		const updated = await markNotificationRead(c.env.DB, user.id, notificationId);
		if (!updated) {
			return jsonResponse({ ok: false, error: "Notification not found" }, { status: 404 });
		}
		return new Response(null, { status: 204 });
	});

	app.post("/v1/notifications/mark-all-read", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const updated = await markAllNotificationsRead(c.env.DB, user.id);
		return jsonResponse({ ok: true, data: { updated } });
	});

	app.post("/v1/notifications/events/test", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const body = await c.req.json().catch(() => null);
		const format = typeof body?.format === "string" ? body.format.trim() : "";
		const oldStatus = typeof body?.old_status === "string" ? body.old_status.trim() : "";
		const newStatus = typeof body?.new_status === "string" ? body.new_status.trim() : "";
		if (!format || !oldStatus || !newStatus) {
			return jsonResponse({ ok: false, error: "format, old_status, and new_status are required" }, { status: 400 });
		}
		let shelfItemData;
		try {
			shelfItemData = await resolveShelfItemForNotification(c.env.DB, user.id, {
				shelf_item_id: typeof body?.shelf_item_id === "string" ? body.shelf_item_id : undefined,
				title: typeof body?.title === "string" ? body.title : undefined,
				author: typeof body?.author === "string" ? body.author : undefined,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Shelf item not found";
			return jsonResponse({ ok: false, error: message }, { status: 400 });
		}
		const deepLink = typeof body?.deep_link === "string" ? body.deep_link : null;
		const eventId = await insertNotificationEvent(c.env.DB, {
			userId: user.id,
			shelfItemId: shelfItemData.id,
			format,
			oldStatus,
			newStatus,
			deepLink,
		});
		await publishNotificationEvent(c.env.NOTIFICATION_EVENTS, user.id, {
			id: eventId,
			shelf_item_id: shelfItemData.id,
			title: shelfItemData.title,
			author: shelfItemData.author,
			format,
			old_status: oldStatus,
			new_status: newStatus,
			deep_link: deepLink,
		});
		return jsonResponse({ ok: true, data: { id: eventId } });
	});
};
