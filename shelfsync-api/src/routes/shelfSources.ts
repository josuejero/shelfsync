import type { Hono } from "hono";
import { z } from "zod";
import { jsonResponse } from "../utils/http";
import { requireAuthUser } from "../auth/session";
import {
	createShelfSource,
	ensureCsvSource,
	fetchRssSource,
	fetchShelfSourceById,
	listShelfSources,
	upsertShelfSourceMeta,
} from "../db/shelfSources";
import { parseGoodreadsCsv, upsertShelfItems } from "../parsers/goodreads";
import type { Env, GoodreadsCsvRow } from "../types";

const rssConnectSchema = z.object({
	rss_url: z.string().url(),
	shelf: z.string().optional(),
	sync_now: z.boolean().optional(),
});

const parseRssPayload = async (c: Hono<{ Bindings: Env }>["req"]) => {
	const body = await c.json().catch(() => null);
	const parsed = rssConnectSchema.safeParse(body);
	return parsed.success ? parsed.data : null;
};

export const registerShelfSourceRoutes = (app: Hono<{ Bindings: Env }>) => {
	app.get("/v1/shelf-sources", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const sources = await listShelfSources(c.env.DB, user.id);
		return jsonResponse({ ok: true, data: { sources } });
	});

	app.post("/v1/shelf-sources/rss", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const payload = await parseRssPayload(c.req);
		if (!payload) {
			return jsonResponse({ ok: false, error: "Invalid payload" }, { status: 400 });
		}

		const meta = payload.shelf ? { shelf: payload.shelf } : {};
		const existing = await fetchRssSource(c.env.DB, user.id, payload.rss_url);
		if (existing) {
			const existingMeta = existing.meta ?? {};
			const mergedMeta = { ...existingMeta, ...meta };
			if (payload.shelf) {
				mergedMeta.shelf = payload.shelf;
			}
			await upsertShelfSourceMeta(c.env.DB, existing.id, mergedMeta);
			const updated = await fetchShelfSourceById(c.env.DB, user.id, existing.id);
			return jsonResponse({ ok: true, data: { source: updated } });
		}

		const created = await createShelfSource(c.env.DB, user.id, meta, payload.rss_url);
		return jsonResponse({ ok: true, data: { source: created } });
	});

	app.post("/v1/shelf-sources/goodreads/import/csv", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}

		const form = await c.req.formData();
		const file = form.get("file") as File | null;
		if (!file) {
			return jsonResponse({ ok: false, error: "Missing file" }, { status: 400 });
		}

		const text = await file.text();
		let rows: GoodreadsCsvRow[] = [];
		let parseErrors: { line: number; error: string }[] = [];
		try {
			const parsed = parseGoodreadsCsv(text);
			rows = parsed.rows;
			parseErrors = parsed.errors;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Invalid CSV";
			return jsonResponse({ ok: false, error: message }, { status: 400 });
		}

		const sourceRef = file.name?.trim() || "upload";
		const source = await ensureCsvSource(c.env.DB, user.id, sourceRef);
		if (!source?.id) {
			return jsonResponse(
				{ ok: false, error: "Unable to resolve CSV shelf source" },
				{ status: 500 },
			);
		}

		const summary = await upsertShelfItems(c.env.DB, user.id, source.id, rows);
		const mergedErrors = [
			...summary.errors,
			...parseErrors.map((err) => ({
				key: err.line ? `line:${err.line}` : "line:unknown",
				error: err.error,
			})),
		];

		return jsonResponse({
			ok: true,
			data: {
				summary: {
					created: summary.created,
					updated: summary.updated,
					skipped: summary.skipped + parseErrors.length,
					errors: mergedErrors,
				},
			},
		});
	});

	app.delete("/v1/shelf-sources/:id", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}

		const sourceId = c.req.param("id");
		if (!sourceId) {
			return jsonResponse({ ok: false, error: "Source ID is required" }, { status: 400 });
		}

		const existing = await fetchShelfSourceById(c.env.DB, user.id, sourceId);
		if (!existing) {
			return jsonResponse({ ok: false, error: "Source not found" }, { status: 404 });
		}

		await c.env.DB.prepare("DELETE FROM shelf_sources WHERE id = ?").bind(sourceId).run();
		return jsonResponse({ ok: true });
	});
};
