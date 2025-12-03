import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends client-side error to Sentry with auto-instrumentation', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Client Test Error';
  });

  await page.goto(`/`);

  await expect(page.locator('button').filter({ hasText: 'Break the client' })).toBeVisible();

  await page.locator('button').filter({ hasText: 'Break the client' }).click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Client Test Error',
          mechanism: {
            handled: false,
          },
        },
      ],
    },
  });

  expect(errorEvent.transaction).toBe('/');
});

test('Sends server-side function error to Sentry with auto-instrumentation', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Server Function Test Error';
  });

  await page.goto(`/`);

  await expect(page.locator('button').filter({ hasText: 'Break server function' })).toBeVisible();

  await page.locator('button').filter({ hasText: 'Break server function' }).click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Server Function Test Error',
          mechanism: {
            handled: false,
          },
        },
      ],
    },
  });

  expect(errorEvent.transaction).toBe('/');
});

test('Sends API route error to Sentry if manually instrumented', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry API Route Test Error';
  });

  await page.goto(`/`);

  await expect(page.locator('button').filter({ hasText: 'Break API route' })).toBeVisible();

  await page.locator('button').filter({ hasText: 'Break API route' }).click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry API Route Test Error',
          mechanism: {
            handled: true,
          },
        },
      ],
    },
  });

  expect(errorEvent.transaction).toBe('GET /api/error');
});
