import type { D1Database } from "@cloudflare/workers-types";
import { formatNotificationEvent, NOTIFICATION_SSE_HEADERS } from "../notificationEvents";
import type { NotificationListRow } from "../types";

export const createLegacyNotificationStream = (
	db: D1Database,
	userId: string,
	signal?: AbortSignal,
) => {
	let lastId: string | null = null;
	let poller: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const emit = async () => {
				try {
					const row = await db
						.prepare(
							"SELECT notification_events.id, notification_events.shelf_item_id, notification_events.format, notification_events.old_status, notification_events.new_status, notification_events.deep_link, notification_events.created_at FROM notification_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
						)
						.bind(userId)
						.first<
							Pick<
								NotificationListRow,
								"id" | "shelf_item_id" | "format" | "old_status" | "new_status" | "deep_link"
							> & { created_at: string | null }
						>();
					if (row && row.id !== lastId) {
						lastId = row.id;
						const payload = {
							id: row.id,
							shelf_item_id: row.shelf_item_id,
							format: row.format,
							old_status: row.old_status,
							new_status: row.new_status,
							deep_link: row.deep_link,
							ts: row.created_at ?? new Date().toISOString(),
						};
						controller.enqueue(
							formatNotificationEvent({
								type: "notification",
								payload,
								timestamp: new Date().toISOString(),
							}),
						);
					}
				} catch {
					/* ignore transient errors */
				}
			};
			poller = setInterval(() => {
				void emit();
			}, 2500);
			void emit();
			signal?.addEventListener("abort", () => {
				if (poller) {
					clearInterval(poller);
				}
				controller.close();
			});
		},
	});

	return new Response(stream, { headers: NOTIFICATION_SSE_HEADERS });
};
