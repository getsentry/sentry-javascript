import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

// These tests guard the Cloudflare execution context lookup in `@sentry/sveltekit`.
//
// `@sveltejs/adapter-cloudflare` 8 renamed `platform.context` to `platform.ctx`. The SDK reads that
// object to get `waitUntil`, and every use of it is optional-chained — so when the lookup misses,
// nothing throws: `flushAndDispose()` is simply never scheduled and the Worker isolate is torn down
// with the events still queued. The assertions below therefore double as flush assertions; if the
// SDK stops finding the execution context, no event reaches the proxy and these time out.

test('sends a streamed server span for a Worker-rendered route', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('sveltekit-3-cloudflare-workers', span => {
    return getSpanOp(span) === 'http.server' && span.is_segment;
  });

  await page.goto('/');

  await expect(page.locator('h1')).toHaveText('SvelteKit 3 on Cloudflare Workers');

  const serverSpan = await serverSpanPromise;

  expect(serverSpan.name).toBe('GET /');
  expect(serverSpan.status).toBe('ok');
  expect(serverSpan.trace_id).toMatch(/[a-f0-9]{32}/);
});

test('captures a server load error thrown in the Worker', async ({ page }) => {
  const errorEventPromise = waitForError('sveltekit-3-cloudflare-workers', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Server Load Error on Cloudflare';
  });

  await page.goto('/server-load-error');

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]).toMatchObject({
    value: 'Server Load Error on Cloudflare',
    mechanism: expect.objectContaining({ handled: false }),
  });
});

// `handleError` runs after `wrapRequestHandler` has already returned for streamed responses, so it
// resolves the execution context a second time and flushes through it independently.
test('captures a server route error thrown in the Worker', async ({ request }) => {
  const errorEventPromise = waitForError('sveltekit-3-cloudflare-workers', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Server Route Error on Cloudflare';
  });

  await request.get('/server-route-error').catch(() => {
    // a 500 is expected here
  });

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('Server Route Error on Cloudflare');
});
