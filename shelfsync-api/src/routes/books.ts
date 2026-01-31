import type { Hono } from "hono";
import { jsonResponse } from "../utils/http";
import { requireAuthUser } from "../auth/session";
import { fetchShelfItemById, fetchShelfSourceById } from "../db/shelfSources";
import { fetchUserSettings, buildSettingsPayload } from "../db/users";
import {
	fetchAvailabilitySnapshotsForCatalogIds,
	fetchCatalogItemsByIds,
	fetchTopCatalogMatch,
} from "../db/catalog";
import { computeReadNext, sortAvailabilityEntries, toAvailabilityResponse } from "../utils/availability";
import type { Env, AvailabilityEntry } from "../types";

export const registerBookRoutes = (app: Hono<{ Bindings: Env }>) => {
	app.get("/v1/books/:id", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}

		const shelfItemId = c.req.param("id");
		if (!shelfItemId) {
			return jsonResponse({ ok: false, error: "Book not found" }, { status: 404 });
		}

		const shelfItem = await fetchShelfItemById(c.env.DB, user.id, shelfItemId);
		if (!shelfItem) {
			return jsonResponse({ ok: false, error: "Book not found" }, { status: 404 });
		}

		const settingsRow = await fetchUserSettings(c.env.DB, user.id);
		const settings = buildSettingsPayload(settingsRow);
		const preferredFormats = settings.preferred_formats;

		const matchRow = await fetchTopCatalogMatch(c.env.DB, user.id, shelfItemId);
		let matchOut: {
			catalog_item_id: string;
			provider: string;
			provider_item_id: string;
			method: string;
			confidence: number;
		} | null = null;
	let availabilityEntries: AvailabilityEntry[] = [];

		if (matchRow) {
			const catalogMap = await fetchCatalogItemsByIds(c.env.DB, [
				matchRow.catalog_item_id,
			]);
			const availabilityMap = await fetchAvailabilitySnapshotsForCatalogIds(
				c.env.DB,
				user.id,
				[matchRow.catalog_item_id],
			);
			availabilityEntries = availabilityMap.get(matchRow.catalog_item_id) ?? [];
			const matchCatalog = catalogMap.get(matchRow.catalog_item_id);
			if (matchCatalog) {
				matchOut = {
					catalog_item_id: matchRow.catalog_item_id,
					provider: matchRow.provider,
					provider_item_id: matchCatalog.provider_item_id,
					method: matchRow.method,
					confidence: Number(matchRow.confidence ?? 0),
				};
			}
		}

		const availabilitySorted = sortAvailabilityEntries(availabilityEntries, preferredFormats);
		const availabilityResponse = availabilitySorted.map((entry) =>
			toAvailabilityResponse(entry),
		);
		const readNext = computeReadNext(availabilityEntries, preferredFormats);

		let source = null;
		if (shelfItem.shelf_source_id) {
			const src = await fetchShelfSourceById(c.env.DB, user.id, shelfItem.shelf_source_id);
			if (src) {
				source = {
					id: src.id,
					source_type: src.source_type,
					provider: src.provider,
					source_ref: src.source_ref,
					last_synced_at: src.last_synced_at,
					last_sync_status: src.last_sync_status,
					last_sync_error: src.last_sync_error,
				};
			}
		}

		return jsonResponse({
			ok: true,
			data: {
				shelf_item: {
					id: shelfItem.id,
					title: shelfItem.title,
					author: shelfItem.author,
					isbn10: shelfItem.isbn10,
					isbn13: shelfItem.isbn13,
					asin: shelfItem.asin,
					shelf: shelfItem.shelf,
					needs_fuzzy_match: shelfItem.needs_fuzzy_match === 1,
				},
				match: matchOut,
				availability: availabilityResponse,
				source,
				settings,
				read_next: readNext,
				generated_at: new Date().toISOString(),
			},
		});
	});
};
