import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// The pageload should connect to the live serving request even though the shell is prerendered
// (trace context can only travel in the dynamic/resumed part of the response, never in cacheable
// HTML). The inverse assertion in cacheComponents.spec.ts ("Prerendered shell does not stitch
// the pageload onto a stale trace") documents today's un-connectedness.
test('connects the pageload trace to the live serving request', async ({ page }) => {
  test.fail();

  const serverSpanPromise = waitForStreamedSpan('nextjs-16-streaming-cacheComponents', span => {
    return span.name === 'GET /pageload-tracing' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-streaming-cacheComponents', span => {
    return span.name === '/pageload-tracing' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/pageload-tracing');

  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  expect(serverSpan.trace_id).toBeTruthy();
  expect(pageloadSpan.trace_id).toBe(serverSpan.trace_id);
});
