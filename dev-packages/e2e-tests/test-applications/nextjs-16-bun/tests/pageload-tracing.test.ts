import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('App router spans should be attached to the pageload request span', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-16-bun', span => {
    return span.name === 'GET /pageload-tracing' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-bun', span => {
    return span.name === '/pageload-tracing' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/pageload-tracing`);

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  expect(pageloadSpan.trace_id).toBeTruthy();
  expect(serverSpan.trace_id).toBe(pageloadSpan.trace_id);
});

// Bun runtime does not populate HTTP request headers as span attributes
// because the OTel HTTP instrumentation does not extract headers when running on Bun.
// This is a known behavioral difference from Node.js.
