import { expect, test } from '@playwright/test';
import { waitForSession } from '@sentry-internal/test-utils';

test('should report healthy sessions', async ({ page }) => {
  test.skip(process.env.TEST_ENV === 'development', 'test is flakey in dev mode');

  const sessionPromise = waitForSession('nextjs-13', session => {
    return session.init === true && session.status === 'ok' && session.errors === 0;
  });

  await page.goto('/healthy-session-page');

  expect(await sessionPromise).toBeDefined();
});

test('should report crashed sessions', async ({ page }) => {
  test.skip(process.env.TEST_ENV === 'development', 'test is flakey in dev mode');

  const sessionPromise = waitForSession('nextjs-13', session => {
    return session.init === false && session.status === 'crashed' && session.errors === 1;
  });

  await page.goto('/crashed-session-page');

  expect(await sessionPromise).toBeDefined();
});
