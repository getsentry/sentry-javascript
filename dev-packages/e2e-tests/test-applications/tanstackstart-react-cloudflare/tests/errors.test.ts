import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends client-side error to Sentry', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react-cloudflare', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Client Test Error';
  });

  await page.goto(`/`);

  await expect(page.locator('#client-error-btn')).toBeVisible();

  await page.locator('#client-error-btn').click();

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

test('Sends server-side function error to Sentry', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react-cloudflare', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Server Function Test Error';
  });

  await page.goto(`/`);

  await expect(page.locator('#throw-server-fn-btn')).toBeVisible();

  await page.locator('#throw-server-fn-btn').click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Server Function Test Error',
          mechanism: {
            type: 'auto.middleware.tanstackstart.server_function',
            handled: false,
          },
        },
      ],
    },
  });
});

test('Sends API route error to Sentry', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react-cloudflare', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry API Route Test Error';
  });

  await page.goto(`/`);

  await expect(page.locator('#api-error-btn')).toBeVisible();

  await page.locator('#api-error-btn').click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry API Route Test Error',
          mechanism: {
            type: 'auto.middleware.tanstackstart.request',
            handled: false,
          },
        },
      ],
    },
  });
});

test('Does not send SSR loader error to Sentry', async ({ baseURL, page }) => {
  let errorEventOccurred = false;

  waitForError('tanstackstart-react-cloudflare', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Sentry SSR Test Error') {
      errorEventOccurred = true;
    }
    return event?.transaction === 'GET /ssr-error';
  });

  const transactionEventPromise = waitForTransaction('tanstackstart-react-cloudflare', transactionEvent => {
    return transactionEvent?.transaction === 'GET /ssr-error';
  });

  await page.goto('/ssr-error');

  await transactionEventPromise;

  await (await fetch(`${baseURL}/api/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});
