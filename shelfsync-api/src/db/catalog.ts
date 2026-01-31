import type { D1Database } from "@cloudflare/workers-types";
import type {
	AvailabilityEntry,
	CatalogItemRow,
	CatalogMatchRow,
} from "../types";

export const fetchCatalogMatchesForShelfItems = async (
	db: D1Database,
	userId: string,
	shelfItemIds: string[],
) => {
	if (!shelfItemIds.length) {
		return [];
	}
	const placeholders = shelfItemIds.map(() => "?").join(", ");
	const rows = await db
		.prepare(
			`SELECT id, user_id, shelf_item_id, catalog_item_id, provider, method, confidence FROM catalog_matches WHERE user_id = ? AND shelf_item_id IN (${placeholders})`,
		)
		.bind(userId, ...shelfItemIds)
		.all<CatalogMatchRow>();
	return rows.results;
};

export const fetchTopCatalogMatch = async (
	db: D1Database,
	userId: string,
	shelfItemId: string,
) => {
	const row = await db
		.prepare(
			"SELECT id, user_id, shelf_item_id, catalog_item_id, provider, method, confidence FROM catalog_matches WHERE user_id = ? AND shelf_item_id = ? ORDER BY confidence DESC LIMIT 1",
		)
		.bind(userId, shelfItemId)
		.first<CatalogMatchRow>();
	return row ?? null;
};

export const fetchCatalogItemsByIds = async (db: D1Database, catalogIds: string[]) => {
	if (!catalogIds.length) {
		return new Map<string, CatalogItemRow>();
	}
	const placeholders = catalogIds.map(() => "?").join(", ");
	const rows = await db
		.prepare(`SELECT id, provider_item_id FROM catalog_items WHERE id IN (${placeholders})`)
		.bind(...catalogIds)
		.all<CatalogItemRow>();
	const map = new Map<string, CatalogItemRow>();
	for (const row of rows.results) {
		map.set(row.id, row);
	}
	return map;
};

export const fetchAvailabilitySnapshotsForCatalogIds = async (
	db: D1Database,
	userId: string,
	catalogIds: string[],
) => {
	if (!catalogIds.length) {
		return new Map<string, AvailabilityEntry[]>();
	}
	const placeholders = catalogIds.map(() => "?").join(", ");
	const rows = await db
		.prepare(
			`SELECT catalog_item_id, format, status, copies_available, copies_total, holds, deep_link, last_checked_at FROM availability_snapshots WHERE user_id = ? AND catalog_item_id IN (${placeholders})`,
		)
		.bind(userId, ...catalogIds)
		.all<AvailabilityEntry>();

	const map = new Map<string, AvailabilityEntry[]>();
	for (const entry of rows.results) {
		const existing = map.get(entry.catalog_item_id);
		const record: AvailabilityEntry = {
			catalog_item_id: entry.catalog_item_id,
			format: entry.format,
			status: entry.status,
			copies_available: entry.copies_available,
			copies_total: entry.copies_total,
			holds: entry.holds,
			deep_link: entry.deep_link,
			last_checked_at: entry.last_checked_at,
		};
		if (existing) {
			existing.push(record);
		} else {
			map.set(entry.catalog_item_id, [record]);
		}
	}

	return map;
};
