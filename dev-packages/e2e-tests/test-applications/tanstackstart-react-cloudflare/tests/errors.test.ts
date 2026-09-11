import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

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
    // The thrown error propagates back to the client over the server-function RPC and is also
    // captured there as an `onunhandledrejection` with the same message. Match on the server-function
    // mechanism so we deterministically pick the server-side event instead of racing the client one.
    return (
      errorEvent?.exception?.values?.[0]?.value === 'Sentry Server Function Test Error' &&
      errorEvent?.exception?.values?.[0]?.mechanism?.type === 'auto.middleware.tanstackstart.server_function'
    );
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
    // As with the server-function test, guard against a same-message client-side duplicate by
    // matching the server request mechanism, so we always assert against the server-side event.
    return (
      errorEvent?.exception?.values?.[0]?.value === 'Sentry API Route Test Error' &&
      errorEvent?.exception?.values?.[0]?.mechanism?.type === 'auto.middleware.tanstackstart.request'
    );
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
    return false;
  });

  const serverSpanPromise = waitForStreamedSpan('tanstackstart-react-cloudflare', span => {
    return span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/ssr-error';
  });

  await page.goto('/ssr-error');

  await serverSpanPromise;

  await (await fetch(`${baseURL}/api/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});
