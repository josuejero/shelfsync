import type {
	D1Database,
	DurableObjectNamespace,
	Queue,
} from "@cloudflare/workers-types";

export type Env = {
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

export type SyncRunKind = "availability_refresh" | "shelf_source_sync";

export type QueueMessage =
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

export type SyncRunRow = {
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

export type SyncRunResponse = Omit<SyncRunRow, "user_id">;

export type JsonResponsePayload = {
	ok: boolean;
	data?: unknown;
	error?: string | string[];
};

export type AuthPayload = {
	email: string;
	password: string;
};

export type D1UserRow = {
	id: string;
	email: string;
	password_hash?: string;
};

export type D1UserSettingsRow = {
	library_system: string | null;
	preferred_formats: string | null;
	notifications_enabled: number;
	updated_at: string | null;
};

export type ShelfSourceRow = {
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

export type ShelfItemRow = {
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

export type UserSettingsData = {
	library_system: string | null;
	preferred_formats: string[];
	notifications_enabled: boolean;
	updated_at: string | null;
};

export type GoodreadsCsvRow = {
	external_id: string | null;
	title: string;
	author: string;
	isbn10: string | null;
	isbn13: string | null;
	asin: string | null;
	shelf: string | null;
};

export type AvailabilityEntry = {
	catalog_item_id: string;
	format: string | null;
	status: string | null;
	copies_available: number | null;
	copies_total: number | null;
	holds: number | null;
	deep_link: string | null;
	last_checked_at: string | null;
};

export type CatalogMatchRow = {
	id: string;
	user_id: string;
	shelf_item_id: string;
	catalog_item_id: string;
	provider: string;
	method: string;
	confidence: number | null;
};

export type CatalogItemRow = {
	id: string;
	provider_item_id: string;
};

export type NotificationListRow = {
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

export type NotificationInsertArgs = {
	userId: string;
	shelfItemId: string;
	format: string;
	oldStatus: string;
	newStatus: string;
	deepLink?: string | null;
};
