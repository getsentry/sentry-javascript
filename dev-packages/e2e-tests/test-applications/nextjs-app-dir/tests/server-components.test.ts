import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a transaction for a request to app router', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return transactionEvent?.transaction === 'GET /server-component/parameter/[...parameters]';
  });

  await page.goto('/server-component/parameter/1337/42');

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    data: expect.objectContaining({
      'sentry.op': 'http.server',
      'sentry.origin': 'manual',
      'sentry.sample_rate': 1,
      'sentry.source': 'route',
    }),
    op: 'http.server',
    origin: 'manual',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      request: {
        cookies: {},
        headers: expect.any(Object),
        url: expect.any(String),
      },
    }),
  );

  expect(Object.keys(transactionEvent.request?.headers!).length).toBeGreaterThan(0);
});

test('Should not set an error status on an app router transaction when it redirects', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /server-component/redirect';
  });

  await page.goto('/server-component/redirect');

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent.contexts?.trace?.status).not.toBe('internal_error');
});

test('Should set a "not_found" status on an app router transaction when notFound() is called', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /server-component/not-found';
  });

  await page.goto('/server-component/not-found');

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent.contexts?.trace?.status).toBe('not_found');
});

test('Should capture an error and transaction with correct status for a app router page', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /server-component/faulty';
  });

  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'I am a faulty server component';
  });

  await page.goto('/server-component/faulty');

  const transactionEvent = await transactionEventPromise;
  const errorEvent = await errorEventPromise;

  expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');

  expect(errorEvent.transaction).toBe(`Page Server Component (/server-component/faulty)`);

  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  expect(transactionEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(transactionEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});
