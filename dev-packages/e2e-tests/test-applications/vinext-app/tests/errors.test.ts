import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('captures a client-side error', async ({ page }) => {
  const errorEventPromise = waitForError('vinext-app', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'E2E Test Error';
  });

  await page.goto('/error-page');
  await page.locator('#error-button').click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'E2E Test Error',
  });
});

test('captures a server-side API route error', async ({ baseURL }) => {
  const errorEventPromise = waitForError('vinext-app', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'API Route Error';
  });

  await fetch(`${baseURL}/api/test`, { method: 'POST' });

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'API Route Error',
  });
});
