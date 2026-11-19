import { expect, test } from '@playwright/test';
import { HTTP_SERVER, PAGELOAD } from '@sentry/conventions/op';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('continues the server trace in the pageload', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('solid-2-ssr', span => {
    return getSpanOp(span) === HTTP_SERVER && span.is_segment && span.name === 'GET /user/:id';
  });
  const pageloadSpanPromise = waitForStreamedSpan('solid-2-ssr', span => {
    return getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  await page.goto('/user/5');

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  expect(pageloadSpan.trace_id).toBe(serverSpan.trace_id);
  expect(pageloadSpan.parent_span_id).toBe(serverSpan.span_id);
});
