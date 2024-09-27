import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('captures an exception', async ({ page }) => {
  const errorEventPromise = waitForError('solidstart', errorEvent => {
    return (
      !errorEvent.type &&
      errorEvent.exception?.values?.[0]?.value ===
        'Error 1 thrown from Sentry ErrorBoundary in Solid Start E2E test app'
    );
  });

  await page.goto('/error-boundary');
  // The first page load causes a hydration error on the dev server sometimes - a reload works around this
  await page.reload();
  await page.locator('#caughtErrorBtn').click();
  const errorEvent = await errorEventPromise;

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error 1 thrown from Sentry ErrorBoundary in Solid Start E2E test app',
          mechanism: {
            type: 'generic',
            handled: true,
          },
        },
      ],
    },
    transaction: '/error-boundary',
  });
});

test('captures a second exception after resetting the boundary', async ({ page }) => {
  const firstErrorEventPromise = waitForError('solidstart', errorEvent => {
    return (
      !errorEvent.type &&
      errorEvent.exception?.values?.[0]?.value ===
        'Error 1 thrown from Sentry ErrorBoundary in Solid Start E2E test app'
    );
  });

  await page.goto('/error-boundary');
  await page.locator('#caughtErrorBtn').click();
  const firstErrorEvent = await firstErrorEventPromise;

  expect(firstErrorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error 1 thrown from Sentry ErrorBoundary in Solid Start E2E test app',
          mechanism: {
            type: 'generic',
            handled: true,
          },
        },
      ],
    },
    transaction: '/error-boundary',
  });

  const secondErrorEventPromise = waitForError('solidstart', errorEvent => {
    return (
      !errorEvent.type &&
      errorEvent.exception?.values?.[0]?.value ===
        'Error 2 thrown from Sentry ErrorBoundary in Solid Start E2E test app'
    );
  });

  await page.locator('#errorBoundaryResetBtn').click();
  await page.locator('#caughtErrorBtn').click();
  const secondErrorEvent = await secondErrorEventPromise;

  expect(secondErrorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error 2 thrown from Sentry ErrorBoundary in Solid Start E2E test app',
          mechanism: {
            type: 'generic',
            handled: true,
          },
        },
      ],
    },
    transaction: '/error-boundary',
  });
});
