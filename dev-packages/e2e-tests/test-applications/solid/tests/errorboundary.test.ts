import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('captures an exception', async ({ page }) => {
  const errorEventPromise = waitForError('solid', errorEvent => {
    return (
      !errorEvent.type &&
      errorEvent.exception?.values?.[0]?.value === 'Error 1 thrown from Sentry ErrorBoundary in Solid E2E test app'
    );
  });

  const [, , errorEvent] = await Promise.all([
    page.goto('/'),
    page.locator('#caughtErrorBtn').click(),
    errorEventPromise,
  ]);

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error 1 thrown from Sentry ErrorBoundary in Solid E2E test app',
          mechanism: {
            type: 'auto.function.solid.error_boundary',
            handled: true,
          },
        },
      ],
    },
    transaction: '/',
  });
});

test('captures a second exception after resetting the boundary', async ({ page }) => {
  const firstErrorEventPromise = waitForError('solid', errorEvent => {
    return (
      !errorEvent.type &&
      errorEvent.exception?.values?.[0]?.value === 'Error 1 thrown from Sentry ErrorBoundary in Solid E2E test app'
    );
  });

  const [, , firstErrorEvent] = await Promise.all([
    page.goto('/'),
    page.locator('#caughtErrorBtn').click(),
    firstErrorEventPromise,
  ]);

  expect(firstErrorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error 1 thrown from Sentry ErrorBoundary in Solid E2E test app',
          mechanism: {
            type: 'auto.function.solid.error_boundary',
            handled: true,
          },
        },
      ],
    },
    transaction: '/',
  });

  const secondErrorEventPromise = waitForError('solid', errorEvent => {
    return (
      !errorEvent.type &&
      errorEvent.exception?.values?.[0]?.value === 'Error 2 thrown from Sentry ErrorBoundary in Solid E2E test app'
    );
  });

  const [, , secondErrorEvent] = await Promise.all([
    page.locator('#errorBoundaryResetBtn').click(),
    page.locator('#caughtErrorBtn').click(),
    await secondErrorEventPromise,
  ]);

  expect(secondErrorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error 2 thrown from Sentry ErrorBoundary in Solid E2E test app',
          mechanism: {
            type: 'auto.function.solid.error_boundary',
            handled: true,
          },
        },
      ],
    },
    transaction: '/',
  });
});
