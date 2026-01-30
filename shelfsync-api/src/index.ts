import { Hono, type Context } from "hono";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import Papa from "papaparse";
import type {
	D1Database,
	DurableObjectNamespace,
	ExportedHandler,
	MessageBatch,
	Queue,
} from "@cloudflare/workers-types";
import {
	publishSyncRunEvent,
	SYNC_RUN_EVENT_HEADER,
	SYNC_RUN_EVENT_PATH,
} from "./syncRunEvents";
import {
	publishNotificationEvent,
	NOTIFICATION_EVENT_HEADER,
	NOTIFICATION_EVENT_PATH,
	NOTIFICATION_SSE_HEADERS,
	formatNotificationEvent,
} from "./notificationEvents";

const DEFAULT_ORIGINS = [
	"https://shelfsync-six.vercel.app",
	"https://shelfsync.vercel.app",
	"http://localhost:3000",
	"http://localhost:8787",
] as const;

const DEFAULT_COOKIE_NAME = "shelfsync_auth";
const DEFAULT_TOKEN_TTL_MINUTES = 60;

type Env = {
	DB: D1Database;
	JWT_SECRET?: string;
	ALLOWED_ORIGINS?: string;
	COOKIE_DOMAIN?: string;
	ALLOW_INSECURE_COOKIES?: string;
	AUTH_COOKIE_NAME?: string;
	AUTH_ACCESS_TOKEN_TTL_MINUTES?: string;
	SYNC_QUEUE?: Queue;
	SYNC_RUN_EVENTS?: DurableObjectNamespace;
	NOTIFICATION_EVENTS?: DurableObjectNamespace;
};

type SyncRunKind = "availability_refresh" | "shelf_source_sync";

type QueueMessage =
	| {
			runId: string;
			userId: string;
			kind: "availability_refresh";
			payload?: Record<string, unknown>;
	  }
	| {
			runId: string;
			userId: string;
			kind: "shelf_source_sync";
			payload: { sourceId: string };
	  };

type SyncRunRow = {
	id: string;
	user_id: string;
	kind: string;
	status: string;
	progress_current: number;
	progress_total: number;
	error_message: string | null;
	started_at: string | null;
	finished_at: string | null;
	created_at: string;
	updated_at: string;
};

type SyncRunResponse = Omit<SyncRunRow, "user_id">;

type JsonResponsePayload = {
	ok: boolean;
	data?: unknown;
	error?: string | string[];
};

type AuthPayload = {
	email: string;
	password: string;
};

type D1UserRow = {
	id: string;
	email: string;
	password_hash?: string;
};

type D1UserSettingsRow = {
	library_system: string | null;
	preferred_formats: string | null;
	notifications_enabled: number;
	updated_at: string | null;
};

type ShelfSourceRow = {
	id: string;
	user_id: string;
	source_type: string;
	provider: string;
	source_ref: string;
	meta: string | null;
	is_active: number;
	last_synced_at: string | null;
	last_sync_status: string | null;
	last_sync_error: string | null;
};

type ShelfItemRow = {
	id: string;
	title: string;
	author: string | null;
	isbn10: string | null;
	isbn13: string | null;
	asin: string | null;
	shelf: string | null;
	needs_fuzzy_match: number;
	updated_at: string | null;
	shelf_source_id: string | null;
};

type UserSettingsData = {
	library_system: string | null;
	preferred_formats: string[];
	notifications_enabled: boolean;
	updated_at: string | null;
};

type GoodreadsCsvRow = {
	external_id: string | null;
	title: string;
	author: string;
	isbn10: string | null;
	isbn13: string | null;
	asin: string | null;
	shelf: string | null;
};

const encoder = new TextEncoder();
const _ws = /\s+/g;
const _nonAlnum = /[^a-zA-Z0-9]+/g;

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(6),
});

const settingsPatchSchema = z.object({
	library_system: z.string().nullable().optional(),
	preferred_formats: z.array(z.string()).optional(),
	notifications_enabled: z.boolean().optional(),
});

type AvailabilityEntry = {
	catalog_item_id: string;
	format: string | null;
	status: string | null;
	copies_available: number | null;
	copies_total: number | null;
	holds: number | null;
	deep_link: string | null;
	last_checked_at: string | null;
};

type CatalogMatchRow = {
	id: string;
	user_id: string;
	shelf_item_id: string;
	catalog_item_id: string;
	provider: string;
	method: string;
	confidence: number | null;
};

type CatalogItemRow = {
	id: string;
	provider_item_id: string;
};

const STATUS_WEIGHT: Record<string, number> = {
	available: 1000.0,
	hold: 500.0,
	not_owned: 0.0,
};

const computeReadNext = (
	availability: AvailabilityEntry[] | null | undefined,
	preferredFormats: string[],
) => {
	const preferred = [...(preferredFormats || [])];
	const avail = [...(availability || [])];

	if (!avail.length) {
		return {
			score: STATUS_WEIGHT["not_owned"],
			tier: "not_owned",
			best_format: null,
			hold_ratio: null,
			reasons: [
				"No availability data (not owned or not checked yet)",
				"Tier: not_owned",
			],
		};
	}

	const candidates: {
		fmt: string;
		status: string;
		score: number;
		hold_ratio: number | null;
		copies_available: number | null;
		copies_total: number | null;
		holds: number | null;
		fmt_index: number;
	}[] = [];

	for (const entry of avail) {
		const fmt = entry.format;
		if (!fmt) {
			continue;
		}
		if (preferred.length && !preferred.includes(fmt)) {
			continue;
		}

		const status = entry.status ?? "not_owned";
		const copiesAvailable = entry.copies_available ?? null;
		const copiesTotal = entry.copies_total ?? null;
		const holds = entry.holds ?? null;

		const fmtIndex = preferred.indexOf(fmt);
		const fmtBonus = fmtIndex !== -1 ? 20.0 / (fmtIndex + 1) : 0.0;

		const base = STATUS_WEIGHT[status] ?? STATUS_WEIGHT["not_owned"];

		let copiesBonus = 0.0;
		if (status === "available" && copiesAvailable !== null) {
			copiesBonus = Math.min(Math.max(copiesAvailable, 0), 10);
		}

		let holdRatio: number | null = null;
		let holdPenalty = 0.0;
		if (status === "hold" && holds !== null) {
			if (copiesTotal !== null && copiesTotal > 0) {
				holdRatio = holds / Math.max(copiesTotal, 1);
				holdPenalty = Math.min(holdRatio * 25.0, 400.0);
			} else {
				holdPenalty = Math.min(holds * 2.0, 400.0);
			}
		}

		const score = base + fmtBonus + copiesBonus - holdPenalty;

		candidates.push({
			fmt,
			status,
			score,
			hold_ratio: holdRatio,
			copies_available: copiesAvailable,
			copies_total: copiesTotal,
			holds,
			fmt_index: fmtIndex !== -1 ? fmtIndex : 999,
		});
	}

	if (!candidates.length) {
		return {
			score: STATUS_WEIGHT["not_owned"],
			tier: "not_owned",
			best_format: null,
			hold_ratio: null,
			reasons: ["No preferred-format availability data", "Tier: not_owned"],
		};
	}

	candidates.sort((a, b) => {
		if (a.score === b.score) {
			return b.fmt_index - a.fmt_index;
		}
		return a.score - b.score;
	});

	const best = candidates[candidates.length - 1];
	const tier = best.status;
	const bestFormat = best.fmt;

	const reasons: string[] = [];
	if (tier === "available") {
		if (preferred.includes(bestFormat)) {
			reasons.push(
				`Available now in ${bestFormat} (preferred #${preferred.indexOf(bestFormat) + 1
				})`,
			);
		} else {
			reasons.push(`Available now in ${bestFormat}`);
		}
		if (best.copies_available !== null || best.copies_total !== null) {
			reasons.push(
				`Copies available: ${best.copies_available ?? 0} / ${best.copies_total ?? 0}`,
			);
		}
	} else if (tier === "hold") {
		if (preferred.includes(bestFormat)) {
			reasons.push(
				`On hold in ${bestFormat} (preferred #${preferred.indexOf(bestFormat) + 1})`,
			);
		} else {
			reasons.push(`On hold in ${bestFormat}`);
		}
		if (
			best.hold_ratio !== null &&
			best.holds !== null &&
			best.copies_total !== null
		) {
			reasons.push(
				`Hold queue: ${best.holds} holds / ${best.copies_total} copies (ratio ${best.hold_ratio.toFixed(
					2,
				)})`,
			);
		} else if (best.holds !== null) {
			reasons.push(`Hold queue: ${best.holds} holds`);
		} else {
			reasons.push("Hold queue length unavailable");
		}
	} else {
		reasons.push("Not owned in your selected library/catalog");
	}

	reasons.push(`Tier: ${tier}`);

	return {
		score: best.score,
		tier,
		best_format: bestFormat,
		hold_ratio: best.hold_ratio,
		reasons,
	};
};

const rssConnectSchema = z.object({
	rss_url: z.string().url(),
	shelf: z.string().optional(),
	sync_now: z.boolean().optional(),
});

const parseAllowedOrigins = (override?: string) => {
	const origins = new Set<string>(DEFAULT_ORIGINS);
	if (!override) {
		return origins;
	}

	for (const entry of override.split(",")) {
		const trimmed = entry.trim();
		if (trimmed) {
			origins.add(trimmed);
		}
	}

	return origins;
};

const pickOrigin = (requestOrigin: string | null, allowed: ReadonlySet<string>) => {
	if (!allowed.size) {
		return undefined;
	}

	if (requestOrigin && allowed.has(requestOrigin)) {
		return requestOrigin;
	}

	return allowed.values().next().value;
};

const appendCorsHeaders = (c: Context, origin?: string) => {
	if (origin) {
		c.header("Access-Control-Allow-Origin", origin);
	}
	c.header("Access-Control-Allow-Credentials", "true");
	c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
	c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
	c.header("Vary", "Origin");
};

const jsonResponse = (payload: JsonResponsePayload, init?: ResponseInit) => {
	const headers = new Headers(init?.headers ?? {});
	if (!headers.has("content-type")) {
		headers.set("content-type", "application/json; charset=utf-8");
	}

	return new Response(JSON.stringify(payload), { ...init, headers });
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

const parseLimitParam = (value?: string | null) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 50;
	}
	return clamp(Math.floor(parsed), 1, 200);
};

const parseOffsetParam = (value?: string | null) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 0;
	}
	return Math.max(Math.floor(parsed), 0);
};

const parseSortParam = (value?: string | null) => {
	if (value === "title" || value === "read_next" || value === "updated") {
		return value;
	}
	return "read_next";
};

const getAuthCookieName = (env: Env) => env.AUTH_COOKIE_NAME ?? DEFAULT_COOKIE_NAME;

const getTokenTtlMinutes = (env: Env) => {
	const parsed = Number(env.AUTH_ACCESS_TOKEN_TTL_MINUTES);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}

	return DEFAULT_TOKEN_TTL_MINUTES;
};

const shouldSetSecureCookie = (env: Env) => env.ALLOW_INSECURE_COOKIES !== "true";

const buildCookieParts = (baseValue: string, env: Env, maxAgeSeconds: number) => {
	const parts = [
		`${getAuthCookieName(env)}=${encodeURIComponent(baseValue)}`,
		"Path=/",
		`Max-Age=${maxAgeSeconds}`,
		"HttpOnly",
		"SameSite=Lax",
	];

	if (env.COOKIE_DOMAIN) {
		parts.push(`Domain=${env.COOKIE_DOMAIN}`);
	}

	if (shouldSetSecureCookie(env)) {
		parts.push("Secure");
	}

	return parts.join("; ");
};

const createAccessTokenCookie = (token: string, env: Env) =>
	buildCookieParts(token, env, getTokenTtlMinutes(env) * 60);

const clearAccessTokenCookie = (env: Env) =>
	buildCookieParts("", env, 0) + "; Expires=Thu, 01 Jan 1970 00:00:00 GMT";

const issueAccessToken = (subject: string, env: Env) => {
	const ttlMinutes = getTokenTtlMinutes(env);
	const expirationSeconds = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
	return new SignJWT({ scope: "user" })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(subject)
		.setIssuedAt()
		.setExpirationTime(expirationSeconds)
		.sign(encoder.encode(env.JWT_SECRET ?? "shelfsync-dev-secret"));
};

const verifyAccessToken = async (token: string, env: Env) => {
	try {
		const secret = encoder.encode(env.JWT_SECRET ?? "shelfsync-dev-secret");
		const { payload } = await jwtVerify(token, secret);
		return payload as Record<string, unknown>;
	} catch {
		return null;
	}
};

const getCookieValue = (cookieHeader: string | null, name: string) => {
	if (!cookieHeader) {
		return null;
	}

	for (const part of cookieHeader.split(";")) {
		const [key, ...rest] = part.split("=");
		if (key?.trim() === name) {
			return decodeURIComponent(rest.join("=").trim());
		}
	}

	return null;
};

const normalizePreferredFormats = (formats?: string[]) => {
	const allowedSet = new Set<string>();
	for (const raw of formats ?? []) {
		const normalized = raw.trim().toLowerCase();
		if (normalized) {
			allowedSet.add(normalized);
		}
	}

	const ordered: string[] = [];
	for (const fmt of ["ebook", "audiobook"]) {
		if (allowedSet.has(fmt)) {
			ordered.push(fmt);
		}
	}

	return ordered;
};

const parsePreferredFormatsValue = (value: string | null) => {
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) {
			return parsed.filter((item) => typeof item === "string");
		}
	} catch {
		// fall through to empty array
	}

	return [];
};

const normalizeText = (value: string) => {
	let text = (value || "").trim().toLowerCase();
	text = text.replace(_nonAlnum, " ");
	text = text.replace(_ws, " ").trim();
	return text;
};

const normalizeIsbn = (value: string | null | undefined) => {
	if (!value) {
		return null;
	}
	const digits = value.replace(/[^0-9xX]/g, "");
	return digits ? digits.toUpperCase() : null;
};

const ensureUserSettingsRow = async (db: D1Database, userId: string) => {
	await db
		.prepare(
			"INSERT OR IGNORE INTO user_settings (user_id, preferred_formats, notifications_enabled, updated_at) VALUES (?, '[]', 1, CURRENT_TIMESTAMP)",
		)
		.bind(userId)
		.run();
};

const fetchUserSettings = async (db: D1Database, userId: string): Promise<UserSettingsData | null> => {
	await ensureUserSettingsRow(db, userId);
	const row = await db
		.prepare(
			"SELECT library_system, preferred_formats, notifications_enabled, updated_at FROM user_settings WHERE user_id = ? LIMIT 1",
		)
		.bind(userId)
		.first<D1UserSettingsRow>();

	if (!row) {
		return null;
	}

	return {
		library_system: row.library_system,
		preferred_formats: parsePreferredFormatsValue(row.preferred_formats),
		notifications_enabled: row.notifications_enabled === 1,
		updated_at: row.updated_at,
	};
};

const buildSettingsPayload = (settings: UserSettingsData | null) => ({
	library_system: settings?.library_system ?? null,
	preferred_formats: settings?.preferred_formats ?? [],
	updated_at: settings?.updated_at ?? null,
});

const fetchUserByEmail = async (db: D1Database, email: string) => {
	const row = await db
		.prepare("SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1")
		.bind(email)
		.first<D1UserRow>();
	return row ?? null;
};

const fetchUserById = async (db: D1Database, id: string) => {
	const row = await db
		.prepare("SELECT id, email FROM users WHERE id = ? LIMIT 1")
		.bind(id)
		.first<D1UserRow>();
	if (!row) {
		return null;
	}
	return { id: row.id, email: row.email };
};

const createUser = async (db: D1Database, email: string, passwordHash: string) => {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO users (id, email, password_hash, is_active, created_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)",
		)
		.bind(id, email, passwordHash)
		.run();
	await ensureUserSettingsRow(db, id);

	return { id, email };
};

const requireAuthUser = async (c: Context) => {
	const cookieHeader = c.req.headers.get("cookie");
	const rawToken = getCookieValue(cookieHeader, getAuthCookieName(c.env));
	if (!rawToken) {
		return null;
	}

	const payload = await verifyAccessToken(rawToken, c.env);
	if (!payload || typeof payload.sub !== "string") {
		return null;
	}

	return fetchUserById(c.env.DB, payload.sub);
};

const listLibraries = async (db: D1Database) => {
	const result = await db
		.prepare("SELECT id, name FROM libraries ORDER BY name ASC")
		.all<{ id: string; name: string }>();
	return result.results;
};

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

const mapShelfSourceRow = (row: ShelfSourceRow) => ({
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

const computeLastSync = (sources: ReturnType<typeof mapShelfSourceRow>[]) => {
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

const mapSyncRunRow = (row: SyncRunRow): SyncRunResponse => ({
	id: row.id,
	kind: row.kind,
	status: row.status,
	progress_current: row.progress_current,
	progress_total: row.progress_total,
	error_message: row.error_message,
	started_at: row.started_at,
	finished_at: row.finished_at,
	created_at: row.created_at,
	updated_at: row.updated_at,
});

const fetchSyncRunRow = async (db: D1Database, runId: string): Promise<SyncRunRow | null> => {
	const row = await db
		.prepare(
			"SELECT id, user_id, kind, status, progress_current, progress_total, error_message, started_at, finished_at, created_at, updated_at FROM sync_runs WHERE id = ? LIMIT 1",
		)
		.bind(runId)
		.first<SyncRunRow>();
	return row ?? null;
};

const createSyncRun = async (db: D1Database, userId: string, kind: SyncRunKind) => {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO sync_runs (id, user_id, kind, status, progress_current, progress_total, created_at, updated_at, started_at) VALUES (?, ?, ?, 'running', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
		)
		.bind(id, userId, kind)
		.run();
	const row = await fetchSyncRunRow(db, id);
	if (!row) {
		throw new Error("unable to create sync run");
	}
	return row;
};

const updateSyncRunProgress = async (
	db: D1Database,
	runId: string,
	current: number,
	options?: { total?: number },
) => {
	const updates = ["progress_current = ?", "updated_at = CURRENT_TIMESTAMP"];
	const values: unknown[] = [current];
	if (typeof options?.total === "number") {
		updates.push("progress_total = ?");
		values.push(options.total);
	}
	values.push(runId);

	await db
		.prepare(`UPDATE sync_runs SET ${updates.join(", ")} WHERE id = ?`)
		.bind(...values)
		.run();
};

const markSyncRunSucceeded = async (db: D1Database, runId: string) => {
	await db
		.prepare(
			"UPDATE sync_runs SET status = 'succeeded', progress_current = progress_total, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		)
		.bind(runId)
		.run();
};

const markSyncRunFailed = async (db: D1Database, runId: string, message: string) => {
	await db
		.prepare(
			"UPDATE sync_runs SET status = 'failed', error_message = ?, progress_current = progress_total, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		)
		.bind(message, runId)
		.run();
};

const updateShelfSourceSyncStatus = async (
	db: D1Database,
	sourceId: string,
	status: "running" | "succeeded" | "failed",
	errorMessage?: string | null,
) => {
	await db
		.prepare(
			"UPDATE shelf_sources SET last_synced_at = CURRENT_TIMESTAMP, last_sync_status = ?, last_sync_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		)
		.bind(status, errorMessage ?? null, sourceId)
		.run();
};

const enqueueSyncMessage = async (env: Env, message: QueueMessage) => {
	if (!env.SYNC_QUEUE) {
		throw new Error("sync queue is not configured");
	}

	await env.SYNC_QUEUE.send(message);
};

const parseBooleanQuery = (value?: string | null) =>
	value === "1" || value === "true" || value === "True";

type NotificationListRow = {
	id: string;
	created_at: string;
	read_at: string | null;
	shelf_item_id: string;
	format: string;
	old_status: string;
	new_status: string;
	deep_link: string | null;
	title: string | null;
	author: string | null;
};

const buildNotificationWhereClause = (unreadOnly: boolean) => {
	const conditions = ["notification_events.user_id = ?"];
	if (unreadOnly) {
		conditions.push("notification_events.read_at IS NULL");
	}
	return conditions.join(" AND ");
};

const listNotificationsForUser = async (
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

const countUnreadNotifications = async (db: D1Database, userId: string) => {
	const row = await db
		.prepare("SELECT COUNT(*) AS total FROM notification_events WHERE user_id = ? AND read_at IS NULL")
		.bind(userId)
		.first<{ total: number }>();
	return Number(row?.total ?? 0);
};

const markNotificationRead = async (db: D1Database, userId: string, notificationId: string) => {
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

const markAllNotificationsRead = async (db: D1Database, userId: string) => {
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

const fetchShelfItemDetail = async (
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

const createNotificationShelfItem = async (
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
		.bind(
			id,
			userId,
			title,
			author,
			normalizeText(title),
			normalizeText(author ?? ""),
		)
		.run();
	return { id, title, author };
};

const resolveShelfItemForNotification = async (
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

type NotificationInsertArgs = {
	userId: string;
	shelfItemId: string;
	format: string;
	oldStatus: string;
	newStatus: string;
	deepLink?: string | null;
};

const insertNotificationEvent = async (db: D1Database, data: NotificationInsertArgs) => {
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

async function notifyProgress(env: Env, runId: string, current: number, total?: number) {
	const payload: Record<string, unknown> = { current };
	if (typeof total === "number") {
		payload.total = total;
	}

	await publishSyncRunEvent(env.SYNC_RUN_EVENTS, runId, "progress", payload);
}

async function notifySuccess(env: Env, runId: string) {
	const payload: Record<string, unknown> = {};
	const row = await fetchSyncRunRow(env.DB, runId);
	if (row) {
		payload.current = row.progress_current;
		payload.total = row.progress_total;
	}

	await publishSyncRunEvent(env.SYNC_RUN_EVENTS, runId, "succeeded", payload);
}

async function notifyFailure(env: Env, runId: string, message: string) {
	const payload: Record<string, unknown> = { message };
	const row = await fetchSyncRunRow(env.DB, runId);
	if (row) {
		payload.current = row.progress_current;
		payload.total = row.progress_total;
	}

	await publishSyncRunEvent(env.SYNC_RUN_EVENTS, runId, "failed", payload);
}

const fetchShelfSources = async (db: D1Database, userId: string) => {
	const result = await db
		.prepare(
			"SELECT id, source_type, provider, source_ref, meta, is_active, last_synced_at, last_sync_status, last_sync_error, user_id FROM shelf_sources WHERE user_id = ? ORDER BY created_at DESC",
		)
		.bind(userId)
		.all<ShelfSourceRow>();
	return result.results.map(mapShelfSourceRow);
};

const fetchShelfSourceById = async (db: D1Database, userId: string, sourceId: string) => {
	const row = await db
		.prepare(
			"SELECT id, source_type, provider, source_ref, meta, is_active, last_synced_at, last_sync_status, last_sync_error, user_id FROM shelf_sources WHERE id = ? AND user_id = ? LIMIT 1",
		)
		.bind(sourceId, userId)
		.first<ShelfSourceRow>();
	return row ? mapShelfSourceRow(row) : null;
};

const fetchRssSource = async (db: D1Database, userId: string, rssUrl: string) => {
	const row = await db
		.prepare(
			"SELECT id, source_type, provider, source_ref, meta, is_active, last_synced_at, last_sync_status, last_sync_error, user_id FROM shelf_sources WHERE user_id = ? AND source_type = 'rss' AND provider = 'goodreads' AND source_ref = ? LIMIT 1",
		)
		.bind(userId, rssUrl)
		.first<ShelfSourceRow>();
	return row ? mapShelfSourceRow(row) : null;
};

const upsertShelfSourceMeta = async (db: D1Database, sourceId: string, meta: Record<string, unknown>) => {
	await db
		.prepare("UPDATE shelf_sources SET meta = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
		.bind(JSON.stringify(meta), sourceId)
		.run();
};

const createShelfSource = async (db: D1Database, userId: string, meta: Record<string, unknown>, rssUrl: string) => {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO shelf_sources (id, user_id, source_type, provider, source_ref, meta, is_active) VALUES (?, ?, 'rss', 'goodreads', ?, ?, 1)",
		)
		.bind(id, userId, rssUrl, JSON.stringify(meta))
		.run();
	return fetchShelfSourceById(db, userId, id);
};

const fetchCsvSource = async (db: D1Database, userId: string) => {
	const row = await db
		.prepare(
			"SELECT id, source_type, provider, source_ref, meta, is_active, last_synced_at, last_sync_status, last_sync_error, user_id FROM shelf_sources WHERE user_id = ? AND source_type = 'csv' AND provider = 'goodreads' LIMIT 1",
		)
		.bind(userId)
		.first<ShelfSourceRow>();
	return row ? mapShelfSourceRow(row) : null;
};

const createCsvSource = async (db: D1Database, userId: string, sourceRef: string) => {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO shelf_sources (id, user_id, source_type, provider, source_ref, meta, is_active) VALUES (?, ?, 'csv', 'goodreads', ?, '{}', 1)",
		)
		.bind(id, userId, sourceRef)
		.run();
	return fetchShelfSourceById(db, userId, id);
};

const ensureCsvSource = async (db: D1Database, userId: string, sourceRef: string) => {
	const existing = await fetchCsvSource(db, userId);
	if (existing) {
		return existing;
	}
	return createCsvSource(db, userId, sourceRef);
};

const fetchShelfItemsForUser = async (db: D1Database, userId: string) => {
	const rows = await db
		.prepare(
			"SELECT id, title, author, isbn10, isbn13, asin, shelf, needs_fuzzy_match, updated_at, shelf_source_id FROM shelf_items WHERE user_id = ?",
		)
		.bind(userId)
		.all<ShelfItemRow>();
	return rows.results;
};

const fetchShelfItemById = async (db: D1Database, userId: string, shelfItemId: string) => {
	const row = await db
		.prepare(
			"SELECT id, title, author, isbn10, isbn13, asin, shelf, needs_fuzzy_match, updated_at, shelf_source_id FROM shelf_items WHERE id = ? AND user_id = ? LIMIT 1",
		)
		.bind(shelfItemId, userId)
		.first<ShelfItemRow>();
	return row ?? null;
};

const fetchCatalogMatchesForShelfItems = async (
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

const fetchTopCatalogMatch = async (
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

const fetchCatalogItemsByIds = async (db: D1Database, catalogIds: string[]) => {
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

const fetchAvailabilitySnapshotsForCatalogIds = async (
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

const toAvailabilityResponse = (entry: AvailabilityEntry) => ({
	format: entry.format,
	status: entry.status,
	copies_available: entry.copies_available,
	copies_total: entry.copies_total,
	holds: entry.holds,
	deep_link: entry.deep_link,
	last_checked_at: entry.last_checked_at,
});

const sortAvailabilityEntries = (
	entries: AvailabilityEntry[],
	preferredFormats: string[],
) => {
	const copy = [...entries];

	const getIndex = (format: string | null) => {
		if (!format) {
			return 999;
		}
		const idx = preferredFormats.indexOf(format);
		return idx === -1 ? 999 : idx;
	};

	copy.sort((a, b) => {
		const idxA = getIndex(a.format);
		const idxB = getIndex(b.format);
		if (idxA !== idxB) {
			return idxA - idxB;
		}
		const afmt = a.format ?? "";
		const bfmt = b.format ?? "";
		return afmt.localeCompare(bfmt);
	});

	return copy;
};

const parseGoodreadsCsv = (text: string) => {
	const sanitized = text.replace(/^\uFEFF/, "");
	const parsed = Papa.parse<Record<string, string>>(sanitized, {
		header: true,
		skipEmptyLines: true,
	});

	const fields = parsed.meta.fields ?? [];
	const required = ["Title", "Author"];
	if (!required.every((field) => fields.includes(field))) {
		throw new Error(
			"CSV missing Title/Author columns. Export from Goodreads → My Books → Import and Export → Export Library.",
		);
	}

	const rows: GoodreadsCsvRow[] = [];
	const errors: { line: number; error: string }[] = [];

	parsed.data.forEach((raw, index) => {
		const line = index + 2;
		const title = (raw["Title"] ?? "").trim();
		const author = (raw["Author"] ?? "").trim();
		if (!title || !author) {
			errors.push({ line, error: "Missing Title/Author" });
			return;
		}

		const externalId = (raw["Book Id"] ?? "").trim() || null;
		const shelf = (raw["Exclusive Shelf"] ?? "").trim() || null;

		rows.push({
			external_id: externalId,
			title,
			author,
			isbn10: normalizeIsbn(raw["ISBN"] ?? null),
			isbn13: normalizeIsbn(raw["ISBN13"] ?? null),
			asin: null,
			shelf,
		});
	});

	parsed.errors.forEach((err) => {
		const line = typeof err.row === "number" ? err.row + 2 : 0;
		errors.push({ line, error: err.message });
	});

	return { rows, errors };
};

const upsertShelfItems = async (
	db: D1Database,
	userId: string,
	sourceId: string,
	items: GoodreadsCsvRow[],
) => {
	const summary = {
		created: 0,
		updated: 0,
		skipped: 0,
		errors: [] as { key: string; error: string }[],
	};

	for (const item of items) {
		try {
			const title = item.title.trim();
			const author = item.author.trim();
			if (!title || !author) {
				summary.skipped += 1;
				continue;
			}

			const normalizedTitle = normalizeText(title);
			const normalizedAuthor = normalizeText(author);
			const needsFuzzy = !item.isbn10 && !item.isbn13 && !item.asin;

			let targetId: string | null = null;
			if (item.external_id) {
				const existing = await db
					.prepare(
						"SELECT id FROM shelf_items WHERE shelf_source_id = ? AND external_id = ? AND user_id = ? LIMIT 1",
					)
					.bind(sourceId, item.external_id, userId)
					.first<{ id: string }>();
				if (existing) {
					targetId = existing.id;
				}
			}

			if (targetId) {
				await db
					.prepare(
						"UPDATE shelf_items SET title = ?, author = ?, isbn10 = ?, isbn13 = ?, asin = ?, normalized_title = ?, normalized_author = ?, shelf = ?, needs_fuzzy_match = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
					)
					.bind(
						title,
						author,
						item.isbn10,
						item.isbn13,
						item.asin,
						normalizedTitle,
						normalizedAuthor,
						item.shelf,
						needsFuzzy ? 1 : 0,
						targetId,
					)
					.run();
				summary.updated += 1;
			} else {
				await db
					.prepare(
						"INSERT INTO shelf_items (id, user_id, shelf_source_id, external_id, title, author, isbn10, isbn13, asin, normalized_title, normalized_author, shelf, needs_fuzzy_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
					)
					.bind(
						crypto.randomUUID(),
						userId,
						sourceId,
						item.external_id,
						title,
						author,
						item.isbn10,
						item.isbn13,
						item.asin,
						normalizedTitle,
						normalizedAuthor,
						item.shelf,
						needsFuzzy ? 1 : 0,
					)
					.run();
				summary.created += 1;
			}
		} catch (error) {
			summary.errors.push({
				key: item.external_id ?? `${item.title}:${item.author}`,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	return summary;
};

const listShelfSources = async (db: D1Database, userId: string) => fetchShelfSources(db, userId);

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
	const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);
	const requestOrigin = c.req?.headers?.get("origin") ?? null;
	const origin = pickOrigin(requestOrigin, allowedOrigins);
	if (origin) {
		appendCorsHeaders(c, origin);
	} else {
		appendCorsHeaders(c);
	}
	return next();
});

app.options("*", (c) => {
	const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);
	const requestOrigin = c.req?.headers?.get("origin") ?? null;
	const origin = pickOrigin(requestOrigin, allowedOrigins);

	const headers = new Headers();
	if (origin) {
		headers.set("Access-Control-Allow-Origin", origin);
	}
	headers.set("Access-Control-Allow-Credentials", "true");
	headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
	headers.set("Vary", "Origin");

	return new Response(null, { status: 204, headers });
});

const parseAuthPayload = async (c: Context): Promise<AuthPayload | null> => {
	const body = await c.req.json().catch(() => null);
	const parsed = loginSchema.safeParse(body);
	return parsed.success ? parsed.data : null;
};

const parseSettingsPayload = async (c: Context) => {
	const body = await c.req.json().catch(() => null);
	const parsed = settingsPatchSchema.safeParse(body);
	return parsed.success ? parsed.data : null;
};

const parseRssPayload = async (c: Context) => {
	const body = await c.req.json().catch(() => null);
	const parsed = rssConnectSchema.safeParse(body);
	return parsed.success ? parsed.data : null;
};

app.get("/health", () => jsonResponse({ ok: true, data: { status: "ok" } }));

app.post("/v1/auth/signup", async (c) => {
	const payload = await parseAuthPayload(c);
	if (!payload) {
		return jsonResponse({ ok: false, error: "Invalid payload" }, { status: 400 });
	}

	const existing = await fetchUserByEmail(c.env.DB, payload.email);
	if (existing) {
		return jsonResponse({ ok: false, error: "Email already registered" }, { status: 400 });
	}

	const passwordHash = await bcrypt.hash(payload.password, 10);
	const user = await createUser(c.env.DB, payload.email, passwordHash);
	const token = issueAccessToken(user.id, c.env);

	return jsonResponse(
		{ ok: true, data: { user } },
		{ status: 201, headers: { "Set-Cookie": createAccessTokenCookie(token, c.env) } },
	);
});

app.post("/v1/auth/login", async (c) => {
	const payload = await parseAuthPayload(c);
	if (!payload) {
		return jsonResponse({ ok: false, error: "Invalid credentials" }, { status: 400 });
	}

	const userRow = await fetchUserByEmail(c.env.DB, payload.email);
	if (!userRow || !userRow.password_hash) {
		return jsonResponse({ ok: false, error: "Invalid email or password" }, { status: 401 });
	}

	const matches = await bcrypt.compare(payload.password, userRow.password_hash);
	if (!matches) {
		return jsonResponse({ ok: false, error: "Invalid email or password" }, { status: 401 });
	}

	const token = issueAccessToken(userRow.id, c.env);

	return jsonResponse(
		{ ok: true, data: { user: { id: userRow.id, email: userRow.email } } },
		{ headers: { "Set-Cookie": createAccessTokenCookie(token, c.env) } },
	);
});

app.get("/v1/auth/me", async (c) => {
	const user = await requireAuthUser(c);
	if (!user) {
		return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	return jsonResponse({ ok: true, data: { user } });
});

app.post("/v1/auth/logout", (c) =>
	jsonResponse({ ok: true }, { headers: { "Set-Cookie": clearAccessTokenCookie(c.env) } }),
);

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

app.get("/v1/libraries", async (c) => {
	const user = await requireAuthUser(c);
	if (!user) {
		return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const libraries = await listLibraries(c.env.DB);
	return jsonResponse({ ok: true, data: { libraries } });
});

app.post("/v1/sync-runs/availability/refresh", async (c) => {
	const user = await requireAuthUser(c);
	if (!user) {
		return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	let run: SyncRunRow;
	try {
		run = await createSyncRun(c.env.DB, user.id, "availability_refresh");
	} catch (error) {
		console.error("[sync-run] failed to create run", error);
		return jsonResponse({ ok: false, error: "Unable to start sync run" }, { status: 500 });
	}

	await notifyProgress(c.env, run.id, run.progress_current, run.progress_total);

	try {
		await enqueueSyncMessage(c.env, { runId: run.id, userId: user.id, kind: "availability_refresh" });
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : "queue unavailable";
		await markSyncRunFailed(c.env.DB, run.id, errMsg);
		await notifyFailure(c.env, run.id, errMsg);
		return jsonResponse({ ok: false, error: "Sync queue unavailable" }, { status: 503 });
	}

	return jsonResponse({ ok: true, data: { job_id: run.id } }, { status: 202 });
});

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
	const matchByShelf = new Map<string, CatalogMatchRow>();
	matchRows.forEach((row) => matchByShelf.set(row.shelf_item_id, row));

	const catalogIds = Array.from(
		new Set(matchRows.map((row) => row.catalog_item_id)),
	);
	const catalogItemsMap = await fetchCatalogItemsByIds(
		c.env.DB,
		catalogIds,
	);
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

	const payload = await parseRssPayload(c);
	if (!payload) {
		return jsonResponse({ ok: false, error: "Invalid payload" }, { status: 400 });
	}

	const meta = payload.shelf ? { shelf: payload.shelf } : {};
	const existing = await fetchRssSource(c.env.DB, user.id, payload.rss_url);
	if (existing) {
		const existingMeta = (existing.meta ?? {}) as Record<string, unknown>;
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

app.post("/v1/shelf-sources/:id/sync", async (c) => {
	const user = await requireAuthUser(c);
	if (!user) {
		return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const sourceId = c.req.param("id");
	if (!sourceId) {
		return jsonResponse({ ok: false, error: "Source ID is required" }, { status: 400 });
	}

	const source = await fetchShelfSourceById(c.env.DB, user.id, sourceId);
	if (!source) {
		return jsonResponse({ ok: false, error: "Source not found" }, { status: 404 });
	}

	if (source.source_type !== "rss") {
		return jsonResponse(
			{ ok: false, error: "Only RSS sources can be synced" },
			{ status: 400 },
		);
	}

	await updateShelfSourceSyncStatus(c.env.DB, sourceId, "running");

	let run: SyncRunRow;
	try {
		run = await createSyncRun(c.env.DB, user.id, "shelf_source_sync");
	} catch (error) {
		console.error("[sync-run] failed to create run", error);
		await updateShelfSourceSyncStatus(
			c.env.DB,
			sourceId,
			"failed",
			"failed to create run",
		);
		return jsonResponse({ ok: false, error: "Unable to start sync run" }, { status: 500 });
	}

	await notifyProgress(c.env, run.id, run.progress_current, run.progress_total);

	try {
		await enqueueSyncMessage(c.env, {
			runId: run.id,
			userId: user.id,
			kind: "shelf_source_sync",
			payload: { sourceId },
		});
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : "queue unavailable";
		await markSyncRunFailed(c.env.DB, run.id, errMsg);
		await notifyFailure(c.env, run.id, errMsg);
		await updateShelfSourceSyncStatus(c.env.DB, sourceId, "failed", errMsg);
		return jsonResponse({ ok: false, error: "Sync queue unavailable" }, { status: 503 });
	}

	return jsonResponse({ ok: true, data: { job_id: run.id } }, { status: 202 });
});

app.get("/v1/notifications", async (c) => {
	const user = await requireAuthUser(c);
	if (!user) {
		return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const limit = parseLimitParam(c.req.query("limit"));
	const offset = parseOffsetParam(c.req.query("offset"));
	const unreadOnly = parseBooleanQuery(c.req.query("unread_only"));

	const { total, rows } = await listNotificationsForUser(c.env.DB, user.id, limit, offset, unreadOnly);
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

app.get("/v1/sync-runs/:id", async (c) => {
	const user = await requireAuthUser(c);
	if (!user) {
		return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const runId = c.req.param("id");
	if (!runId) {
		return jsonResponse({ ok: false, error: "Run ID is required" }, { status: 400 });
	}

	const row = await fetchSyncRunRow(c.env.DB, runId);
	if (!row || row.user_id !== user.id) {
		return jsonResponse({ ok: false, error: "Run not found" }, { status: 404 });
	}

	return jsonResponse({ ok: true, data: { run: mapSyncRunRow(row) } });
});

const LEGACY_SSE_HEADERS = {
	"content-type": "text/event-stream",
	"cache-control": "no-cache",
	Connection: "keep-alive",
} as const;

const createLegacySyncRunStream = (
	db: D1Database,
	runId: string,
	initialRow: SyncRunRow,
	signal?: AbortSignal,
) => {
	const stream = new ReadableStream({
		start(controller) {
			const sendEvent = (type: string, payload: Record<string, unknown>) => {
				const data = JSON.stringify({ type, payload });
				controller.enqueue(encoder.encode(`event: sync\ndata: ${data}\n\n`));
			};

			let lastUpdated = initialRow.updated_at;

			const emitRowState = (row: SyncRunRow) => {
				const type = row.status === "running" ? "progress" : row.status;
				const payload =
					type === "progress"
						? {
								current: row.progress_current,
								total: row.progress_total,
						  }
						: type === "failed"
						? { message: row.error_message ?? "failed" }
						: {
								current: row.progress_current,
								total: row.progress_total,
						  };

				sendEvent(type, payload);
				return type;
			};

			const initialType = emitRowState(initialRow);

			if (initialType !== "running") {
				controller.close();
				return;
			}

			const poller = setInterval(async () => {
				const latest = await fetchSyncRunRow(db, runId);
				if (!latest || latest.updated_at === lastUpdated) {
					return;
				}
				lastUpdated = latest.updated_at;

				const type = emitRowState(latest);
				if (type === "failed" || type === "succeeded") {
					clearInterval(poller);
					controller.close();
				}
			}, 2500);

			signal?.addEventListener("abort", () => {
				clearInterval(poller);
				controller.close();
			});
		},
	});

	return new Response(stream, { headers: LEGACY_SSE_HEADERS });
};

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

const createLegacyNotificationStream = (
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

const runAvailabilityRefreshJob = async (env: Env, run: SyncRunRow) => {
	await updateSyncRunProgress(env.DB, run.id, 0, { total: 1 });
	await notifyProgress(env, run.id, 0, 1);

	await updateSyncRunProgress(env.DB, run.id, 1);
	await notifyProgress(env, run.id, 1, 1);

	await markSyncRunSucceeded(env.DB, run.id);
	await notifySuccess(env, run.id);
};

const runShelfSourceSyncJob = async (env: Env, run: SyncRunRow, sourceId: string) => {
	const source = await env.DB
		.prepare("SELECT user_id FROM shelf_sources WHERE id = ? LIMIT 1")
		.bind(sourceId)
		.first<{ user_id: string }>();

	if (!source || source.user_id !== run.user_id) {
		throw new Error("Shelf source not found");
	}

	await updateSyncRunProgress(env.DB, run.id, 0, { total: 1 });

	await updateShelfSourceSyncStatus(env.DB, sourceId, "running");

	// Placeholder for actual sync work
	await updateShelfSourceSyncStatus(env.DB, sourceId, "succeeded");

	await updateSyncRunProgress(env.DB, run.id, 0, { total: 1 });
	await notifyProgress(env, run.id, 0, 1);

	await updateSyncRunProgress(env.DB, run.id, 1);
	await notifyProgress(env, run.id, 1, 1);

	await markSyncRunSucceeded(env.DB, run.id);
	await notifySuccess(env, run.id);
};

const processQueueMessage = async (env: Env, message: QueueMessage) => {
	const run = await fetchSyncRunRow(env.DB, message.runId);
	if (!run || run.user_id !== message.userId) {
		throw new Error("Sync run not found");
	}

	if (message.kind === "availability_refresh") {
		await runAvailabilityRefreshJob(env, run);
		return;
	}

	if (message.kind === "shelf_source_sync") {
		const sourceId = message.payload?.sourceId;
		if (!sourceId) {
			throw new Error("Missing source ID");
		}
		await runShelfSourceSyncJob(env, run, sourceId);
		return;
	}

	throw new Error(`Unknown sync kind: ${message.kind}`);
};

export const queue: ExportedHandler<Env, QueueMessage>["queue"] = (
	batch,
	env,
	ctx,
) => {
	const task = Promise.all(
		batch.messages.map(async (message) => {
			try {
				await processQueueMessage(env, message.body);
			} catch (error) {
				console.error("[sync queue] task failed", error);
				const { runId, kind } = message.body ?? {};
				if (runId) {
					const errMsg = error instanceof Error ? error.message : "job failed";
					await markSyncRunFailed(env.DB, runId, errMsg);
					await notifyFailure(env, runId, errMsg);
					if (kind === "shelf_source_sync" && message.body?.payload?.sourceId) {
						await updateShelfSourceSyncStatus(
							env.DB,
							message.body.payload.sourceId,
							"failed",
							errMsg,
						);
					}
				}
			}
		}),
	);

	ctx.waitUntil(task);
	return task;
};

app.onError((err) => {
	console.error("[Worker] uncaught error", err);
	return jsonResponse({ ok: false, error: "Internal server error" }, { status: 500 });
});

app.notFound(() => jsonResponse({ ok: false, error: "Not found" }, { status: 404 }));

export default app;
