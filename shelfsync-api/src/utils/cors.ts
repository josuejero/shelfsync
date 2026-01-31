import { type Context } from "hono";
import { DEFAULT_ORIGINS } from "../constants";

export const parseAllowedOrigins = (override?: string) => {
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

export const pickOrigin = (requestOrigin: string | null, allowed: ReadonlySet<string>) => {
	if (!allowed.size) {
		return undefined;
	}

	if (requestOrigin && allowed.has(requestOrigin)) {
		return requestOrigin;
	}

	return allowed.values().next().value;
};

export const appendCorsHeaders = (c: Context, origin?: string) => {
	if (origin) {
		c.header("Access-Control-Allow-Origin", origin);
	}
	c.header("Access-Control-Allow-Credentials", "true");
	c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
	c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
	c.header("Vary", "Origin");
};
