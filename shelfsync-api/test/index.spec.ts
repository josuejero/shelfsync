import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('ShelfSync worker', () => {
	it('responds to /health with ok payload (unit style)', async () => {
		const request = new IncomingRequest('http://example.com/health');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(
			`"{"ok":true,"data":{"status":"ok"}}"`,
		);
	});

	it('exposes /health via the runtime (integration style)', async () => {
		const response = await SELF.fetch('https://example.com/health');
		expect(await response.text()).toMatchInlineSnapshot(
			`"{"ok":true,"data":{"status":"ok"}}"`,
		);
	});
});
