import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('should not capture serverside suspense errors', async ({ page }) => {
  const pageServerComponentSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /suspense-error' && span.is_segment;
  });

  let errorEvent;
  waitForError('nextjs-16', async errorEvent => {
    return errorEvent?.transaction === 'Page Server Component (/suspense-error)';
  }).then(event => {
    errorEvent = event;
  });

  await page.goto(`/suspense-error`);

  // Just to be a little bit more sure
  await page.waitForTimeout(5000);

  const pageServerComponentSpan = await pageServerComponentSpanPromise;
  expect(pageServerComponentSpan).toBeDefined();

  expect(errorEvent).toBeUndefined();
});
