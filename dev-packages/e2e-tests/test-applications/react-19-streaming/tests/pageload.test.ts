import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends a streamed pageload span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-19-streaming', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/');

  const span = await spanPromise;

  expect(span.name).toBe('/');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.status).toBe('ok');
  expect(span.attributes?.['sentry.origin']?.value).toBe('auto.pageload.browser');
  expect(span.attributes?.['sentry.source']?.value).toBe('url');
});
