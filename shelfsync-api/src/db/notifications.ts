import type { D1Database } from "@cloudflare/workers-types";
import { normalizeText } from "../utils/text";
import type {
	NotificationInsertArgs,
	NotificationListRow,
} from "../types";

const buildNotificationWhereClause = (unreadOnly: boolean) => {
	const conditions = ["notification_events.user_id = ?"];
	if (unreadOnly) {
		conditions.push("notification_events.read_at IS NULL");
	}
	return conditions.join(" AND ");
};

export const listNotificationsForUser = async (
	db: D1Database,
	userId: string,
	limit: number,
	offset: number,
	unreadOnly: boolean,
) => {
	const whereClause = buildNotificationWhereClause(unreadOnly);
	const totalRow = await db
		.prepare(`SELECT COUNT(*) AS total FROM notification_events WHERE ${whereClause}`)
		.bind(userId)
		.first<{ total: number }>();
	const total = Number(totalRow?.total ?? 0);
	const stmt = `
		SELECT
			notification_events.id,
			notification_events.created_at,
			notification_events.read_at,
			notification_events.shelf_item_id,
			notification_events.format,
			notification_events.old_status,
			notification_events.new_status,
			notification_events.deep_link,
			shelf_items.title,
			shelf_items.author
		FROM notification_events
		LEFT JOIN shelf_items ON shelf_items.id = notification_events.shelf_item_id
		WHERE ${whereClause}
		ORDER BY notification_events.created_at DESC
		LIMIT ?
		OFFSET ?
	`;
	const rowsResult = await db.prepare(stmt).bind(userId, limit, offset).all<NotificationListRow>();
	const rows = rowsResult.results ?? [];
	return { total, rows };
};

export const countUnreadNotifications = async (db: D1Database, userId: string) => {
	const row = await db
		.prepare("SELECT COUNT(*) AS total FROM notification_events WHERE user_id = ? AND read_at IS NULL")
		.bind(userId)
		.first<{ total: number }>();
	return Number(row?.total ?? 0);
};

export const markNotificationRead = async (db: D1Database, userId: string, notificationId: string) => {
	const row = await db
		.prepare("SELECT read_at FROM notification_events WHERE id = ? AND user_id = ? LIMIT 1")
		.bind(notificationId, userId)
		.first<{ read_at: string | null }>();
	if (!row) {
		return false;
	}
	if (row.read_at === null) {
		await db.prepare("UPDATE notification_events SET read_at = CURRENT_TIMESTAMP WHERE id = ?").bind(notificationId).run();
	}
	return true;
};

export const markAllNotificationsRead = async (db: D1Database, userId: string) => {
	const row = await db
		.prepare("SELECT COUNT(*) AS total FROM notification_events WHERE user_id = ? AND read_at IS NULL")
		.bind(userId)
		.first<{ total: number }>();
	const total = Number(row?.total ?? 0);
	if (total > 0) {
		await db
			.prepare("UPDATE notification_events SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL")
			.bind(userId)
			.run();
	}
	return total;
};

export const fetchShelfItemDetail = async (
	db: D1Database,
	userId: string,
	shelfItemId: string,
) => {
	const row = await db
		.prepare("SELECT title, author FROM shelf_items WHERE id = ? AND user_id = ? LIMIT 1")
		.bind(shelfItemId, userId)
		.first<{ title: string; author: string | null }>();
	return row ?? null;
};

export const createNotificationShelfItem = async (
	db: D1Database,
	userId: string,
	title: string,
	author: string | null,
) => {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO shelf_items (id, user_id, title, author, normalized_title, normalized_author, needs_fuzzy_match) VALUES (?, ?, ?, ?, ?, ?, 1)",
		)
		.bind(id, userId, title, author, normalizeText(title), normalizeText(author ?? ""))
		.run();
	return { id, title, author };
};

export const resolveShelfItemForNotification = async (
	db: D1Database,
	userId: string,
	payload: { shelf_item_id?: string; title?: string; author?: string | null },
) => {
	if (payload.shelf_item_id) {
		const existing = await fetchShelfItemDetail(db, userId, payload.shelf_item_id);
		if (!existing) {
			throw new Error("Shelf item not found");
		}
		return { id: payload.shelf_item_id, title: existing.title, author: existing.author };
	}
	const title = payload.title?.trim() || "";
	if (!title) {
		throw new Error("Title is required when shelf_item_id is missing");
	}
	const author = payload.author?.trim() || null;
	return createNotificationShelfItem(db, userId, title, author);
};

export const insertNotificationEvent = async (db: D1Database, data: NotificationInsertArgs) => {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO notification_events (id, user_id, shelf_item_id, format, old_status, new_status, deep_link) VALUES (?, ?, ?, ?, ?, ?, ?)",
		)
		.bind(
			id,
			data.userId,
			data.shelfItemId,
			data.format,
			data.oldStatus,
			data.newStatus,
			data.deepLink ?? null,
		)
		.run();
	return id;
};
