import type { D1Database, ExportedHandler } from "@cloudflare/workers-types";

interface Env {
	/**
	 * These are non-sensitive build-time identifiers that can be dropped into the
	 * worker via Wrangler env vars or GitHub Actions secrets (but the API keeps
	 * returning the value directly so it must never expose secrets).
	 */
	COMMIT_SHA?: string;
	BUILD_ID?: string;
	DB?: D1Database;
}

const json = (payload: unknown, status = 200) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: {
			"content-type": "application/json;charset=utf-8",
		},
	});

const HEALTH_RESPONSE = { ok: true };

const buildVersionPayload = (env: Env) => ({
	version: env.COMMIT_SHA ?? env.BUILD_ID ?? "dev",
});

const handleDbPing = async (db?: D1Database) => {
	if (!db) {
		return json(
			{
				ok: false,
				message: "D1 binding is not configured",
			},
			503
		);
	}

	try {
		const { results } = await db.prepare("SELECT 1 AS value").all();
		const value = results?.[0]?.value ?? null;
		return json(
			{
				ok: true,
				value,
			},
			200
		);
	} catch (error) {
		console.error("db ping failed", error);
		return json(
			{
				ok: false,
				message: "query failed",
			},
			500
		);
	}
};

export default {
	async fetch(request, env): Promise<Response> {
		const { pathname } = new URL(request.url);

		if (request.method === "GET") {
			if (pathname === "/health") {
				return json(HEALTH_RESPONSE);
			}

			if (pathname === "/version") {
				return json(buildVersionPayload(env));
			}

			if (pathname === "/db/ping") {
				return handleDbPing(env.DB);
			}
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
