import type { Hono } from "hono";
import { type Context } from "hono";
import { z } from "zod";
import { jsonResponse } from "../utils/http";
import { normalizePreferredFormats } from "../utils/text";
import { fetchUserSettings, buildSettingsPayload } from "../db/users";
import { requireAuthUser } from "../auth/session";
import type { Env } from "../types";

const settingsPatchSchema = z.object({
	library_system: z.string().nullable().optional(),
	preferred_formats: z.array(z.string()).optional(),
	notifications_enabled: z.boolean().optional(),
});

const parseSettingsPayload = async (c: Context) => {
	const body = await c.req.json().catch(() => null);
	const parsed = settingsPatchSchema.safeParse(body);
	return parsed.success ? parsed.data : null;
};

export const registerSettingsRoutes = (app: Hono<{ Bindings: Env }>) => {
	app.get("/v1/settings", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const settings = await fetchUserSettings(c.env.DB, user.id);
		if (!settings) {
			return jsonResponse({ ok: false, error: "Settings not found" }, { status: 404 });
		}
		return jsonResponse({ ok: true, data: { settings } });
	});

	app.patch("/v1/settings", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const payload = await parseSettingsPayload(c);
		if (!payload) {
			return jsonResponse({ ok: false, error: "Invalid payload" }, { status: 400 });
		}
		const updates: string[] = [];
		const values: unknown[] = [];
		if (payload.library_system !== undefined) {
			updates.push("library_system = ?");
			values.push(payload.library_system);
		}
		if (payload.preferred_formats !== undefined) {
			const normalized = normalizePreferredFormats(payload.preferred_formats);
			updates.push("preferred_formats = ?");
			values.push(JSON.stringify(normalized));
		}
		if (payload.notifications_enabled !== undefined) {
			updates.push("notifications_enabled = ?");
			values.push(payload.notifications_enabled ? 1 : 0);
		}
		if (updates.length) {
			const query = `UPDATE user_settings SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`;
			await c.env.DB.prepare(query).bind(...values, user.id).run();
		}
		const updated = await fetchUserSettings(c.env.DB, user.id);
		if (!updated) {
			return jsonResponse({ ok: false, error: "Settings not found" }, { status: 404 });
		}
		return jsonResponse({ ok: true, data: { settings: updated } });
	});
};
