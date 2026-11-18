import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

// `release.name` in `vite.config.ts`. The client `Sentry.init` sets no release, so it takes the one the server wrote
// into the page, as the build injects the release into no client chunk.
const RELEASE = 'test-release';

test('Sends client-side errors with the release of the build', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Client Test Error';
  });

  await page.goto('/');
  await page.locator('html[data-hydrated="true"]').waitFor();
  await page.locator('button').filter({ hasText: 'Break the client' }).click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.release).toBe(RELEASE);
});

test('Sends server-side errors with the release of the build', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    return (
      errorEvent?.exception?.values?.[0]?.value === 'Sentry API Route Test Error' &&
      errorEvent?.exception?.values?.[0]?.mechanism?.type === 'auto.middleware.tanstackstart.request'
    );
  });

  await page.goto('/');
  await page.locator('html[data-hydrated="true"]').waitFor();
  await page.locator('button').filter({ hasText: 'Break API route' }).click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.release).toBe(RELEASE);
});
