import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends a client-side exception to Sentry', async ({ page }) => {
  const errorPromise = waitForError('create-remix-app-express-vite-dev', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'I am an error!';
  });

  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();
});

test('Sends a client-side ErrorBoundary exception to Sentry', async ({ page }) => {
  const errorPromise = waitForError('create-remix-app-express-vite-dev', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'Sentry React Component Error';
  });

  await page.goto('/client-error');

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();
});
