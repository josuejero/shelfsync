import type { DurableObjectNamespace, DurableObjectState } from "@cloudflare/workers-types";

const encoder = new TextEncoder();

const SSE_HEADERS = {
	"content-type": "text/event-stream",
	"cache-control": "no-cache, no-transform",
	connection: "keep-alive",
} as const;

const KEEP_ALIVE_INTERVAL = 25_000;
const SYNC_RUN_EVENT_PATH = "https://sync-run/events";
const SYNC_RUN_EVENT_HEADER = "x-sync-run-id";

export type SyncRunEventType = "progress" | "failed" | "succeeded";

export type SyncRunEvent = {
	type: SyncRunEventType;
	payload: Record<string, unknown>;
	timestamp: string;
};

type PublishEventPayload = {
	type: SyncRunEventType;
	payload?: Record<string, unknown>;
};

type SSEClient = {
	id: string;
	controller: ReadableStreamDefaultController<Uint8Array>;
	keepAlive: number;
	signal?: AbortSignal;
	abortHandler?: () => void;
};

export class SyncRunEvents {
	private clients = new Map<string, SSEClient>();
	private lastEvent: SyncRunEvent | null = null;

	constructor(private state: DurableObjectState, _env: unknown) {
		this.state.blockConcurrencyWhile(async () => {
			const stored = await this.state.storage.get<SyncRunEvent>("lastEvent");
			if (stored) {
				this.lastEvent = stored;
			}
		});
	}

	async fetch(request: Request) {
		if (request.method === "GET") {
			return this.handleSubscribe(request);
		}

		if (request.method === "POST") {
			return this.handlePublish(request);
		}

		return new Response("Method not allowed", { status: 405 });
	}

	private handleSubscribe(request: Request) {
		let clientId: string | null = null;

		const stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				const id = crypto.randomUUID();
				clientId = id;

				const keepAlive = setInterval(() => {
					controller.enqueue(encoder.encode(":\n\n"));
				}, KEEP_ALIVE_INTERVAL);

				const abortHandler = () => this.removeClient(id);
				const client: SSEClient = {
					id,
					controller,
					keepAlive,
					signal: request.signal ?? undefined,
					abortHandler,
				};

				request.signal?.addEventListener("abort", abortHandler);
				this.clients.set(id, client);

				if (this.lastEvent) {
					controller.enqueue(this.formatEvent(this.lastEvent));
				}
			},
			cancel: () => {
				if (clientId) {
					this.removeClient(clientId);
				}
			},
		});

		return new Response(stream, { headers: SSE_HEADERS });
	}

	private async handlePublish(request: Request) {
		let payload: PublishEventPayload;
		try {
			payload = await request.json();
		} catch {
			return new Response("Invalid JSON payload", { status: 400 });
		}

		if (!payload?.type || !this.isValidType(payload.type)) {
			return new Response("Missing or invalid event type", { status: 400 });
		}

		const body = payload.payload && typeof payload.payload === "object" ? payload.payload : {};

		const event: SyncRunEvent = {
			type: payload.type,
			payload: body,
			timestamp: new Date().toISOString(),
		};

		this.lastEvent = event;
		await this.state.storage.put("lastEvent", event);
		this.broadcast(event);

		if (event.type !== "progress") {
			this.closeAllClients();
		}

		return new Response("ok");
	}

	private broadcast(event: SyncRunEvent) {
		const chunk = this.formatEvent(event);
		for (const client of Array.from(this.clients.values())) {
			try {
				client.controller.enqueue(chunk);
			} catch {
				this.removeClient(client.id);
			}
		}
	}

	private formatEvent(event: SyncRunEvent) {
		return encoder.encode(`event: sync\ndata: ${JSON.stringify(event)}\n\n`);
	}

	private isValidType(type: string): type is SyncRunEventType {
		return type === "progress" || type === "failed" || type === "succeeded";
	}

	private closeAllClients() {
		for (const id of Array.from(this.clients.keys())) {
			this.removeClient(id);
		}
	}

	private removeClient(clientId: string) {
		const client = this.clients.get(clientId);
		if (!client) {
			return;
		}
		clearInterval(client.keepAlive);
		if (client.signal && client.abortHandler) {
			client.signal.removeEventListener("abort", client.abortHandler);
		}
		try {
			client.controller.close();
		} catch {
			/* ignore */
		}
		this.clients.delete(clientId);
	}
}

export async function publishSyncRunEvent(
	namespace: DurableObjectNamespace | undefined,
	runId: string,
	type: SyncRunEventType,
	payload: Record<string, unknown>,
) {
	if (!namespace) {
		return;
	}

	const durableId = namespace.idFromName(runId);
	const stub = namespace.get(durableId);

	try {
		await stub.fetch(SYNC_RUN_EVENT_PATH, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[SYNC_RUN_EVENT_HEADER]: runId,
			},
			body: JSON.stringify({ type, payload }),
		});
	} catch (error) {
		console.error(`[sync run events] failed to publish ${type} for ${runId}`, error);
	}
}

export { SYNC_RUN_EVENT_PATH, SYNC_RUN_EVENT_HEADER };
