import type { JsonResponsePayload } from "../types";

export const jsonResponse = (payload: JsonResponsePayload, init?: ResponseInit) => {
	const headers = new Headers(init?.headers ?? {});
	if (!headers.has("content-type")) {
		headers.set("content-type", "application/json; charset=utf-8");
	}

	return new Response(JSON.stringify(payload), { ...init, headers });
};
