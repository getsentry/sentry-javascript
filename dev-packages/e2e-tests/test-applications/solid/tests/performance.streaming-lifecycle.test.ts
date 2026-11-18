import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const [, pageloadSpan] = await Promise.all([page.goto('/'), pageloadSpanPromise]);

  expect(pageloadSpan.name).toBe('Pageload');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.browser', type: 'string' },
    'sentry.segment.name.source': { value: 'url', type: 'string' },
  });
});
