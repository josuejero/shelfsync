import { type Context } from "hono";
import type { Hono } from "hono";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { jsonResponse } from "../utils/http";
import { createAccessTokenCookie, issueAccessToken, requireAuthUser, clearAccessTokenCookie } from "../auth/session";
import { fetchUserByEmail, createUser } from "../db/users";
import type { Env } from "../types";

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(6),
});

const parseAuthPayload = async (c: Context) => {
	const body = await c.req.json().catch(() => null);
	const parsed = loginSchema.safeParse(body);
	return parsed.success ? parsed.data : null;
};

export const registerAuthRoutes = (app: Hono<{ Bindings: Env }>) => {
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
};
