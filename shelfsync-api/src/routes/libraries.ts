import type { Hono } from "hono";
import { jsonResponse } from "../utils/http";
import { listLibraries } from "../db/users";
import { requireAuthUser } from "../auth/session";
import type { Env } from "../types";

export const registerLibraryRoutes = (app: Hono<{ Bindings: Env }>) => {
	app.get("/v1/libraries", async (c) => {
		const user = await requireAuthUser(c);
		if (!user) {
			return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
		}
		const libraries = await listLibraries(c.env.DB);
		return jsonResponse({ ok: true, data: { libraries } });
	});
};
