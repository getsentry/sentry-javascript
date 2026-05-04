import { expect, test } from '@playwright/test';
import { waitForError, waitForRootSpan } from '@sentry-internal/test-utils';

test('should not capture serverside suspense errors', async ({ page }) => {
  const pageServerComponentRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'GET /suspense-error';
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

  const pageServerComponentRootSpan = await pageServerComponentRootSpanPromise;
  expect(pageServerComponentRootSpan).toBeDefined();

  expect(errorEvent).toBeUndefined();
});
