import { expect, test } from '@playwright/test';
import { waitForSession } from '@sentry-internal/test-utils';

test.skip('should report healthy sessions', async ({ page }) => {
  const sessionPromise = waitForSession('nextjs-16-pages-dir', session => {
    return session.init === true && session.status === 'ok' && session.errors === 0;
  });

  await page.goto('/healthy-session-page');

  expect(await sessionPromise).toBeDefined();
});

test.skip('should report crashed sessions', async ({ page }) => {
  const sessionPromise = waitForSession('nextjs-16-pages-dir', session => {
    return session.init === false && session.status === 'crashed' && session.errors === 1;
  });

  await page.goto('/crashed-session-page');

  expect(await sessionPromise).toBeDefined();
});
