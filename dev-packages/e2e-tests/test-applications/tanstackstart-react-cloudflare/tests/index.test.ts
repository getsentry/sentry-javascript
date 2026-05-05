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

  expect(errorEvent.exception?.values?.[0]).toEqual({
    type: 'Error',
    value: 'Sentry Client Test Error',
    stacktrace: expect.objectContaining({
      frames: expect.any(Array),
    }),
    mechanism: {
      type: 'auto.browser.global_handlers.onerror',
      handled: false,
    },
  });

  expect(errorEvent.transaction).toBe('/');
  expect(errorEvent.contexts?.trace?.trace_id).toEqual(expect.any(String));
  expect(errorEvent.contexts?.trace?.span_id).toEqual(expect.any(String));
});

test('Sends API route error to Sentry', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react-cloudflare', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry API Route Test Error';
  });

  await page.goto('/');

  await expect(page.locator('#api-error-btn')).toBeVisible();

  await page.locator('#api-error-btn').click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]).toEqual({
    type: 'Error',
    value: 'Sentry API Route Test Error',
    stacktrace: expect.objectContaining({
      frames: expect.any(Array),
    }),
    mechanism: {
      type: 'auto.middleware.tanstackstart.request',
      handled: false,
    },
  });
});

test('Sends server-side transaction for fetch request', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react-cloudflare', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /';
  });

  await fetch(`${baseURL}/`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /');
  expect(transactionEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
    op: 'http.server',
    origin: 'auto.http.cloudflare',
    status: 'ok',
    data: expect.objectContaining({
      'sentry.origin': 'auto.http.cloudflare',
      'sentry.op': 'http.server',
    }),
  });
});

test('Propagates trace from server to client', async ({ page }) => {
  const serverTransactionPromise = waitForTransaction('tanstackstart-react-cloudflare', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /';
  });

  const clientTransactionPromise = waitForTransaction('tanstackstart-react-cloudflare', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  await page.goto('/');

  const serverTransaction = await serverTransactionPromise;
  const clientTransaction = await clientTransactionPromise;

  const serverTraceId = serverTransaction.contexts?.trace?.trace_id;
  const clientTraceId = clientTransaction.contexts?.trace?.trace_id;

  expect(serverTraceId).toEqual(expect.any(String));
  expect(clientTraceId).toEqual(expect.any(String));
  expect(clientTraceId).toBe(serverTraceId);
});
