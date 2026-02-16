import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

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
            type: 'auto.function.tanstackstart',
            handled: false,
          },
        },
      ],
    },
  });

  expect(errorEvent.transaction).toEqual(expect.stringContaining('GET /_serverFn/'));
});

test('Sends API route error to Sentry with auto-instrumentation', async ({ page }) => {
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
            type: 'auto.function.tanstackstart',
            handled: false,
          },
        },
      ],
    },
  });

  expect(errorEvent.transaction).toBe('GET /api/error');
});

test('Does not send SSR loader error to Sentry', async ({ baseURL, page }) => {
  let errorEventOccurred = false;

  waitForError('tanstackstart-react', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Sentry SSR Test Error') {
      errorEventOccurred = true;
    }
    return event?.transaction === 'GET /ssr-error';
  });

  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return transactionEvent?.transaction === 'GET /ssr-error';
  });

  await page.goto('/ssr-error');

  await transactionEventPromise;

  await (await fetch(`${baseURL}/api/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});
