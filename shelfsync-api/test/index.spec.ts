import type { D1Database } from '@cloudflare/workers-types';
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('ShelfSync API worker', () => {
	beforeEach(() => {
		env.COMMIT_SHA = undefined;
		delete env.BUILD_ID;
		env.DB = undefined;
	});

	it('serves /health with { ok: true }', async () => {
		const response = await SELF.fetch('https://example.com/health');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	it('echoes COMMIT_SHA for /version when present', async () => {
		env.COMMIT_SHA = 'abc123';
		const request = new IncomingRequest('https://example.com/version');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ version: 'abc123' });
	});

	it('returns 503 for /db/ping when the D1 binding is missing', async () => {
		const request = new IncomingRequest('https://example.com/db/ping');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			ok: false,
			message: 'D1 binding is not configured',
		});
	});

	it('runs a trivial query when a D1 binding exists', async () => {
		const stubDb = {
			prepare() {
				return {
					all: async () => ({
						results: [{ value: 1 }],
					}),
				};
			},
		} as D1Database;

		const request = new IncomingRequest('https://example.com/db/ping');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { ...env, DB: stubDb }, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, value: 1 });
	});
});
