import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry/core';

function getStringAttribute(span: SerializedStreamedSpan, key: string): string | undefined {
  const attribute = span.attributes[key];
  return attribute?.type === 'string' ? attribute.value : undefined;
}

test('Tunnel route should proxy pageload span to Sentry', async ({ page }) => {
  // Wait for the pageload span to be sent through the tunnel
  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-tunnel', span => {
    return getSpanOp(span) === 'pageload' && span.name === '/' && span.is_segment;
  });

  // Navigate to the page
  await page.goto('/');

  const pageloadSpan = await pageloadSpanPromise;

  // Verify the pageload span was received successfully
  expect(pageloadSpan).toBeDefined();
  expect(pageloadSpan.name).toBe('/');
  expect(getSpanOp(pageloadSpan)).toBe('pageload');
  expect(pageloadSpan.status).toBe('ok');
});

test('Tunnel route should send multiple pageload spans consistently', async ({ page }) => {
  // This test verifies that the tunnel route remains consistent across multiple page loads
  // (important for Turbopack which could generate different tunnel routes for client/server)

  // First pageload
  const firstPageloadPromise = waitForStreamedSpan('nextjs-16-tunnel', span => {
    return getSpanOp(span) === 'pageload' && span.name === '/' && span.is_segment;
  });

  await page.goto('/');
  const firstPageload = await firstPageloadPromise;

  expect(firstPageload).toBeDefined();
  expect(firstPageload.name).toBe('/');
  expect(getSpanOp(firstPageload)).toBe('pageload');
  expect(firstPageload.status).toBe('ok');

  // Second pageload (reload)
  const secondPageloadPromise = waitForStreamedSpan('nextjs-16-tunnel', span => {
    return getSpanOp(span) === 'pageload' && span.name === '/' && span.is_segment;
  });

  await page.reload();
  const secondPageload = await secondPageloadPromise;

  expect(secondPageload).toBeDefined();
  expect(secondPageload.name).toBe('/');
  expect(getSpanOp(secondPageload)).toBe('pageload');
  expect(secondPageload.status).toBe('ok');
});

test('Tunnel requests should not create middleware or fetch spans', async ({ page }) => {
  // This test verifies that our span filtering logic works correctly
  // The proxy runs on all routes, so we'll get a middleware span for `/`
  // But we should NOT get middleware or fetch spans for the tunnel route itself

  // Accumulate every streamed span for the duration of the test. The callback never returns true,
  // so this promise is deliberately left unsettled - the assertions below read the array instead.
  const allSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans('nextjs-16-tunnel', spans => {
    allSpans.push(...spans);
    return false;
  });

  // Wait for pageload span
  const pageloadPromise = waitForStreamedSpan('nextjs-16-tunnel', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/');
  const pageloadSpan = await pageloadPromise;

  // Trigger errors to force tunnel POST requests
  await page
    .evaluate(() => {
      throw new Error('Test tunnel error 1');
    })
    .catch(() => {
      // Expected to throw
    });

  await page
    .evaluate(() => {
      throw new Error('Test tunnel error 2');
    })
    .catch(() => {
      // Expected to throw
    });

  // Wait for events to be sent through tunnel, and for the spans they would wrongly produce to arrive
  await page.waitForTimeout(3000);

  // We should have received the pageload span
  expect(pageloadSpan).toBeDefined();
  expect(getSpanOp(pageloadSpan)).toBe('pageload');

  const middlewareSpans = allSpans.filter(span => getSpanOp(span) === 'middleware');

  // We WILL have a middleware span for GET / (the pageload)
  // But we should NOT have middleware spans for POST requests (tunnel route)
  const postMiddlewareSpans = middlewareSpans.filter(
    span => span.name.includes('POST') || getStringAttribute(span, 'http.request.method') === 'POST',
  );

  expect(postMiddlewareSpans).toHaveLength(0);

  // We should NOT have any fetch spans to Sentry ingest. Matched on the host attribute rather than a
  // substring of the full URL, which would also match an arbitrary host with `sentry.io` elsewhere in it.
  const sentryFetchSpans = allSpans.filter(span => {
    const host = getStringAttribute(span, 'server.address') ?? '';
    return getSpanOp(span) === 'http.client' && (host === 'sentry.io' || host.endsWith('.sentry.io'));
  });

  expect(sentryFetchSpans).toHaveLength(0);
});
