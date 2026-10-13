import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('connects the pageload trace to the runtime server request', async ({ page }) => {
  // The resumed part of the document, which carries the tag, arrives after the SDK started. Enabled
  // once the pageload instrumentation waits for it.
  test.skip(true, 'Needs the deferred pageload start');

  // The shell is prerendered, but the page's dynamic part (`DynamicContent` awaits `headers()`)
  // runs on the server on every request and produces the `GET /pageload-tracing` root span.
  // A fully prerendered page would produce no server span.
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
