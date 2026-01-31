import { Hono } from "hono";
import { jsonResponse } from "./utils/http";
import { appendCorsHeaders, parseAllowedOrigins, pickOrigin } from "./utils/cors";
import { registerAuthRoutes } from "./routes/auth";
import { registerSettingsRoutes } from "./routes/settings";
import { registerLibraryRoutes } from "./routes/libraries";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerShelfSourceRoutes } from "./routes/shelfSources";
import { registerShelfSourceSyncRoutes } from "./routes/shelfSourceSync";
import { registerBookRoutes } from "./routes/books";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerEventRoutes } from "./routes/events";
import { registerSyncRunRoutes } from "./routes/syncRuns";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", () => jsonResponse({ ok: true, data: { status: "ok" } }));

app.use("*", async (c, next) => {
	const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);
	const requestOrigin = c.req?.headers?.get("origin") ?? null;
	const origin = pickOrigin(requestOrigin, allowedOrigins);
	appendCorsHeaders(c, origin ?? undefined);
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

registerAuthRoutes(app);
registerSettingsRoutes(app);
registerLibraryRoutes(app);
registerDashboardRoutes(app);
registerShelfSourceRoutes(app);
registerShelfSourceSyncRoutes(app);
registerBookRoutes(app);
registerNotificationRoutes(app);
registerEventRoutes(app);
registerSyncRunRoutes(app);

app.onError((err) => {
	console.error("[Worker] uncaught error", err);
	return jsonResponse({ ok: false, error: "Internal server error" }, { status: 500 });
});

app.notFound(() => jsonResponse({ ok: false, error: "Not found" }, { status: 404 }));

export default app;
