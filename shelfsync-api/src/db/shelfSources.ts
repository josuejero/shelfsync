import type { D1Database } from "@cloudflare/workers-types";
import type { ShelfSourceRow, ShelfItemRow } from "../types";

const parseMetaValue = (value: string | null): Record<string, unknown> => {
	if (!value) {
		return {};
	}
	try {
		return JSON.parse(value);
	} catch {
		return {};
	}
};

export const mapShelfSourceRow = (row: ShelfSourceRow) => ({
	id: row.id,
	source_type: row.source_type,
	provider: row.provider,
	source_ref: row.source_ref,
	meta: parseMetaValue(row.meta),
	is_active: row.is_active === 1,
	last_synced_at: row.last_synced_at,
	last_sync_status: row.last_sync_status,
	last_sync_error: row.last_sync_error,
});

export const computeLastSync = (sources: ReturnType<typeof mapShelfSourceRow>[]) => {
	if (!sources.length) {
		return {
			source_type: null,
			source_id: null,
			last_synced_at: null,
			last_sync_status: null,
			last_sync_error: null,
		};
	}

	const best = sources.reduce((prev, current) => {
		const prevTs = prev.last_synced_at ? Date.parse(prev.last_synced_at) : 0;
		const currTs = current.last_synced_at ? Date.parse(current.last_synced_at) : 0;
		if (currTs >= prevTs) {
			return current;
		}
		return prev;
	}, sources[0]);

	return {
		source_type: best.source_type ?? null,
		source_id: best.id,
		last_synced_at: best.last_synced_at ?? null,
		last_sync_status: best.last_sync_status ?? null,
		last_sync_error: best.last_sync_error ?? null,
	};
};

export const fetchShelfSources = async (db: D1Database, userId: string) => {
	const result = await db
		.prepare(
			"SELECT id, source_type, provider, source_ref, meta, is_active, last_synced_at, last_sync_status, last_sync_error, user_id FROM shelf_sources WHERE user_id = ? ORDER BY created_at DESC",
		)
		.bind(userId)
		.all<ShelfSourceRow>();
	return result.results.map(mapShelfSourceRow);
};

export const fetchShelfSourceById = async (db: D1Database, userId: string, sourceId: string) => {
	const row = await db
		.prepare(
			"SELECT id, source_type, provider, source_ref, meta, is_active, last_synced_at, last_sync_status, last_sync_error, user_id FROM shelf_sources WHERE id = ? AND user_id = ? LIMIT 1",
		)
		.bind(sourceId, userId)
		.first<ShelfSourceRow>();
	return row ? mapShelfSourceRow(row) : null;
};

export const fetchRssSource = async (db: D1Database, userId: string, rssUrl: string) => {
	const row = await db
		.prepare(
			"SELECT id, source_type, provider, source_ref, meta, is_active, last_synced_at, last_sync_status, last_sync_error, user_id FROM shelf_sources WHERE user_id = ? AND source_type = 'rss' AND provider = 'goodreads' AND source_ref = ? LIMIT 1",
		)
		.bind(userId, rssUrl)
		.first<ShelfSourceRow>();
	return row ? mapShelfSourceRow(row) : null;
};

export const upsertShelfSourceMeta = async (
	db: D1Database,
	sourceId: string,
	meta: Record<string, unknown>,
) => {
	await db
		.prepare("UPDATE shelf_sources SET meta = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
		.bind(JSON.stringify(meta), sourceId)
		.run();
};

export const createShelfSource = async (
	db: D1Database,
	userId: string,
	meta: Record<string, unknown>,
	rssUrl: string,
) => {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO shelf_sources (id, user_id, source_type, provider, source_ref, meta, is_active) VALUES (?, ?, 'rss', 'goodreads', ?, ?, 1)",
		)
		.bind(id, userId, rssUrl, JSON.stringify(meta))
		.run();
	return fetchShelfSourceById(db, userId, id);
};

export const fetchCsvSource = async (db: D1Database, userId: string) => {
	const row = await db
		.prepare(
			"SELECT id, source_type, provider, source_ref, meta, is_active, last_synced_at, last_sync_status, last_sync_error, user_id FROM shelf_sources WHERE user_id = ? AND source_type = 'csv' AND provider = 'goodreads' LIMIT 1",
		)
		.bind(userId)
		.first<ShelfSourceRow>();
	return row ? mapShelfSourceRow(row) : null;
};

export const createCsvSource = async (db: D1Database, userId: string, sourceRef: string) => {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO shelf_sources (id, user_id, source_type, provider, source_ref, meta, is_active) VALUES (?, ?, 'csv', 'goodreads', ?, '{}', 1)",
		)
		.bind(id, userId, sourceRef)
		.run();
	return fetchShelfSourceById(db, userId, id);
};

export const ensureCsvSource = async (db: D1Database, userId: string, sourceRef: string) => {
	const existing = await fetchCsvSource(db, userId);
	if (existing) {
		return existing;
	}
	return createCsvSource(db, userId, sourceRef);
};

export const fetchShelfItemsForUser = async (db: D1Database, userId: string) => {
	const rows = await db
		.prepare(
			"SELECT id, title, author, isbn10, isbn13, asin, shelf, needs_fuzzy_match, updated_at, shelf_source_id FROM shelf_items WHERE user_id = ?",
		)
		.bind(userId)
		.all<ShelfItemRow>();
	return rows.results;
};

export const fetchShelfItemById = async (db: D1Database, userId: string, shelfItemId: string) => {
	const row = await db
		.prepare(
			"SELECT id, title, author, isbn10, isbn13, asin, shelf, needs_fuzzy_match, updated_at, shelf_source_id FROM shelf_items WHERE id = ? AND user_id = ? LIMIT 1",
		)
		.bind(shelfItemId, userId)
		.first<ShelfItemRow>();
	return row ?? null;
};

export const listShelfSources = (db: D1Database, userId: string) => fetchShelfSources(db, userId);
