import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp } from '@sentry-internal/test-utils';

test('Server and client pageload spans should share the same trace', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === 'GET /pageload-tracing' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === '/pageload-tracing' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/pageload-tracing`);

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  expect(pageloadSpan.trace_id).toBeTruthy();
  expect(serverSpan.trace_id).toBe(pageloadSpan.trace_id);
});
