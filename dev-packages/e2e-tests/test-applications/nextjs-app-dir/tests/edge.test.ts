import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should record exceptions for faulty edge server components', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Edge Server Component Error';
  });

  await page.goto('/edge-server-components/error');

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toBeDefined();

  // Assert that isolation scope works properly
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  expect(errorEvent.transaction).toBe(`Page Server Component (/edge-server-components/error)`);

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.function.nextjs.server_component',
  });
});

test('Should record a span for edge server components', async ({ page }) => {
  // The route is only served by the edge runtime, so the span name identifies it on its own. The
  // transaction-based test additionally matched on `contexts.runtime.name`, which span v2 does not carry.
  const serverComponentSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === 'GET /edge-server-components' && span.is_segment;
  });

  await page.goto('/edge-server-components');

  const serverComponentSpan = await serverComponentSpanPromise;

  expect(serverComponentSpan).toBeDefined();
  expect(getSpanOp(serverComponentSpan)).toBe('http.server');
  // Request headers are attached to the span as `http.request.header.*` attributes.
  expect(
    Object.keys(serverComponentSpan.attributes).filter(key => key.startsWith('http.request.header.')).length,
  ).toBeGreaterThan(0);
});
