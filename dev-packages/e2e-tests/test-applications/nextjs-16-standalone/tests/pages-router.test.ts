import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('continues the server trace in the pageload of a Pages Router page', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-16-standalone', span => {
    return span.name === 'GET /pages-router-ssr' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-standalone', span => {
    return span.name === '/pages-router-ssr' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/pages-router-ssr');

  const serverSpan = await serverSpanPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(serverSpan.trace_id).toBeDefined();
  expect(pageloadSpan.trace_id).toBe(serverSpan.trace_id);
  expect(pageloadSpan.attributes['sentry.origin']?.value).toBe('auto.pageload.nextjs.pages_router_instrumentation');
});
