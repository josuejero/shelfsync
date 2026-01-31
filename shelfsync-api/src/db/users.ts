import type { D1Database } from "@cloudflare/workers-types";
import { parsePreferredFormatsValue } from "../utils/text";
import type {
	D1UserRow,
	D1UserSettingsRow,
	UserSettingsData,
} from "../types";

export const ensureUserSettingsRow = async (db: D1Database, userId: string) => {
	await db
		.prepare(
			"INSERT OR IGNORE INTO user_settings (user_id, preferred_formats, notifications_enabled, updated_at) VALUES (?, '[]', 1, CURRENT_TIMESTAMP)",
		)
		.bind(userId)
		.run();
};

export const fetchUserSettings = async (
	db: D1Database,
	userId: string,
): Promise<UserSettingsData | null> => {
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

export const buildSettingsPayload = (settings: UserSettingsData | null) => ({
	library_system: settings?.library_system ?? null,
	preferred_formats: settings?.preferred_formats ?? [],
	updated_at: settings?.updated_at ?? null,
});

export const fetchUserByEmail = async (db: D1Database, email: string) => {
	const row = await db
		.prepare("SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1")
		.bind(email)
		.first<D1UserRow>();
	return row ?? null;
};

export const fetchUserById = async (db: D1Database, id: string) => {
	const row = await db
		.prepare("SELECT id, email FROM users WHERE id = ? LIMIT 1")
		.bind(id)
		.first<D1UserRow>();
	if (!row) {
		return null;
	}
	return { id: row.id, email: row.email };
};

export const createUser = async (db: D1Database, email: string, passwordHash: string) => {
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

export const listLibraries = async (db: D1Database) => {
	const result = await db
		.prepare("SELECT id, name FROM libraries ORDER BY name ASC")
		.all<{ id: string; name: string }>();
	return result.results;
};
