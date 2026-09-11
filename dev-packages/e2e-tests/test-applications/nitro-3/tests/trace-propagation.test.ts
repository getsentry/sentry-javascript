import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Propagates server trace to client pageload via Server-Timing headers', async ({ page }) => {
  const clientSpanPromise = waitForStreamedSpan('nitro-3', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto('/');

  const clientSpan = await clientSpanPromise;

  expect(clientSpan.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(getSpanOp(clientSpan)).toBe('pageload');
});
