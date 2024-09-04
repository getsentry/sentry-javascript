import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return; // Exit if successful
    } catch (error) {
      console.log(`Retrying navigation (${i + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
    }
  }
  throw new Error('Failed to navigate to the page after 3 attempts');
}

// Use safeGoto in your tests


test('captures an exception', async ({ page }) => {
  const errorEventPromise = waitForError('solidstart', errorEvent => {
    return (
      !errorEvent.type &&
      errorEvent.exception?.values?.[0]?.value ===
        'Error 1 thrown from Sentry ErrorBoundary in Solid Start E2E test app'
    );
  });

  await safeGoto(page, '/client-error');
  // await page.goto('/client-error');
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
    transaction: '/client-error',
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

  await page.goto('/client-error');
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
    transaction: '/client-error',
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
    transaction: '/client-error',
  });
});
