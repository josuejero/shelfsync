import { type Context } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { DEFAULT_COOKIE_NAME, DEFAULT_TOKEN_TTL_MINUTES } from "../constants";
import type { Env } from "../types";
import { fetchUserById } from "../db/users";

const encoder = new TextEncoder();

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
		`${env.AUTH_COOKIE_NAME ?? DEFAULT_COOKIE_NAME}=${encodeURIComponent(baseValue)}`,
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

export const createAccessTokenCookie = (token: string, env: Env) =>
	buildCookieParts(token, env, getTokenTtlMinutes(env) * 60);

export const clearAccessTokenCookie = (env: Env) =>
	buildCookieParts("", env, 0) + "; Expires=Thu, 01 Jan 1970 00:00:00 GMT";

export const issueAccessToken = (subject: string, env: Env) => {
	const ttlMinutes = getTokenTtlMinutes(env);
	const expirationSeconds = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
	return new SignJWT({ scope: "user" })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(subject)
		.setIssuedAt()
		.setExpirationTime(expirationSeconds)
		.sign(encoder.encode(env.JWT_SECRET ?? "shelfsync-dev-secret"));
};

export const verifyAccessToken = async (token: string, env: Env) => {
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

export const requireAuthUser = async (c: Context) => {
	const cookieHeader = c.req.headers.get("cookie");
	const rawToken = getCookieValue(cookieHeader, c.env.AUTH_COOKIE_NAME ?? DEFAULT_COOKIE_NAME);
	if (!rawToken) {
		return null;
	}

	const payload = await verifyAccessToken(rawToken, c.env);
	if (!payload || typeof payload.sub !== "string") {
		return null;
	}

	return fetchUserById(c.env.DB, payload.sub);
};
