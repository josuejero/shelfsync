import type { Hono } from "hono";
import { jsonResponse } from "../utils/http";
import { parseLimitParam, parseOffsetParam, parseSortParam } from "../utils/query";
import { requireAuthUser } from "../auth/session";
import {
	buildSettingsPayload,
	fetchUserSettings,
} from "../db/users";
import {
	computeLastSync,
	fetchShelfItemsForUser,
	fetchShelfSources,
} from "../db/shelfSources";
import {
	fetchAvailabilitySnapshotsForCatalogIds,
	fetchCatalogItemsByIds,
	fetchCatalogMatchesForShelfItems,
} from "../db/catalog";
import { computeReadNext, toAvailabilityResponse } from "../utils/availability";
import type { Env, AvailabilityEntry } from "../types";

export const registerDashboardRoutes = (app: Hono<{ Bindings: Env }>) => {
	app.get("/v1/dashboard", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}

		const limit = parseLimitParam(c.req.query("limit"));
		const offset = parseOffsetParam(c.req.query("offset"));
		const sort = parseSortParam(c.req.query("sort"));

		const settingsRow = await fetchUserSettings(c.env.DB, user.id);
		const settings = buildSettingsPayload(settingsRow);
		const preferredFormats = settings.preferred_formats;

		const sources = await fetchShelfSources(c.env.DB, user.id);
		const lastSync = computeLastSync(sources);

		const shelfItems = await fetchShelfItemsForUser(c.env.DB, user.id);
		const sourceIds = new Set(sources.map((s) => s.id));
		const filteredItems = shelfItems.filter(
			(si) => !si.shelf_source_id || sourceIds.has(si.shelf_source_id),
		);

		if (!filteredItems.length) {
			return jsonResponse({
				ok: true,
				data: {
					settings,
					last_sync: lastSync,
					page: { limit, offset, total: 0 },
					items: [],
				},
			});
		}

		const shelfIds = filteredItems.map((si) => si.id);
		const matchRows = await fetchCatalogMatchesForShelfItems(
			c.env.DB,
			user.id,
			shelfIds,
		);
		const matchByShelf = new Map<string, typeof matchRows[number]>();
		matchRows.forEach((row) => matchByShelf.set(row.shelf_item_id, row));

		const catalogIds = Array.from(new Set(matchRows.map((row) => row.catalog_item_id)));
		const catalogItemsMap = await fetchCatalogItemsByIds(c.env.DB, catalogIds);
		const availabilityByCatalog = await fetchAvailabilitySnapshotsForCatalogIds(
			c.env.DB,
			user.id,
			catalogIds,
		);

		const rows = filteredItems.map((si) => {
			const matchRow = matchByShelf.get(si.id);
			let matchOut: {
				catalog_item_id: string;
				provider: string;
				provider_item_id: string;
				method: string;
				confidence: number;
			} | null = null;
			let availabilityEntries: AvailabilityEntry[] = [];

			if (matchRow) {
				availabilityEntries =
					availabilityByCatalog.get(matchRow.catalog_item_id) ?? [];
				const catalogItem = catalogItemsMap.get(matchRow.catalog_item_id);
				if (catalogItem) {
					matchOut = {
						catalog_item_id: matchRow.catalog_item_id,
						provider: matchRow.provider,
						provider_item_id: catalogItem.provider_item_id,
						method: matchRow.method,
						confidence: Number(matchRow.confidence ?? 0),
					};
				}
			}

			const readNext = computeReadNext(availabilityEntries, preferredFormats);
			const availabilityResponse = availabilityEntries.map((entry) =>
				toAvailabilityResponse(entry),
			);

			return {
				shelf_item_id: si.id,
				title: si.title,
				author: si.author,
				shelf: si.shelf,
				needs_fuzzy_match: si.needs_fuzzy_match === 1,
				match: matchOut,
				availability: availabilityResponse,
				read_next: readNext,
				updated_at: si.updated_at,
			};
		});

		if (sort === "read_next") {
			rows.sort((a, b) => b.read_next.score - a.read_next.score);
		} else if (sort === "title") {
			rows.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" }));
		} else if (sort === "updated") {
			rows.sort((a, b) => {
				const aTs = a.updated_at ? Date.parse(a.updated_at) : 0;
				const bTs = b.updated_at ? Date.parse(b.updated_at) : 0;
				return bTs - aTs;
			});
		}

		const total = rows.length;
		const items = rows.slice(offset, offset + limit).map((row) => {
			const { updated_at, ...payload } = row;
			return payload;
		});

		return jsonResponse({
			ok: true,
			data: {
				settings,
				last_sync: lastSync,
				page: { limit, offset, total },
				items,
			},
		});
	});
};
