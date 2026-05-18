import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a server function transaction with span from wrapFetchWithSentry', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react-cloudflare', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent?.transaction?.startsWith('GET /_serverFn')
    );
  });

  await page.goto('/test-serverFn');

  await expect(page.locator('#server-fn-btn')).toBeVisible();

  await page.locator('#server-fn-btn').click();

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace).toMatchObject({
    op: 'http.server',
    origin: 'auto.http.cloudflare',
  });

  expect(transactionEvent?.spans).toHaveLength(1);
  expect(transactionEvent?.spans).toEqual([
    expect.objectContaining({
      description: expect.stringContaining('GET /_serverFn/'),
      op: 'function.tanstackstart',
      origin: 'auto.function.tanstackstart.server',
      data: expect.objectContaining({
        'sentry.op': 'function.tanstackstart',
        'sentry.origin': 'auto.function.tanstackstart.server',
        'tanstackstart.function.hash.sha256': expect.any(String),
      }),
    }),
  ]);
});

test('Sends a server function transaction for a nested server function with manual span', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react-cloudflare', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent?.transaction?.startsWith('GET /_serverFn')
    );
  });

  await page.goto('/test-serverFn');

  await expect(page.locator('#server-fn-nested-btn')).toBeVisible();

  await page.locator('#server-fn-nested-btn').click();

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace).toMatchObject({
    op: 'http.server',
    origin: 'auto.http.cloudflare',
  });

  expect(transactionEvent?.spans).toHaveLength(2);
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: expect.stringContaining('GET /_serverFn/'),
        op: 'function.tanstackstart',
        origin: 'auto.function.tanstackstart.server',
        data: expect.objectContaining({
          'sentry.op': 'function.tanstackstart',
          'sentry.origin': 'auto.function.tanstackstart.server',
          'tanstackstart.function.hash.sha256': expect.any(String),
        }),
      }),
      expect.objectContaining({
        description: 'testNestedLog',
        origin: 'manual',
      }),
    ]),
  );
});

test('Sends server-side transaction for page request', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react-cloudflare', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /';
  });

  await fetch(`${baseURL}/`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /');
  expect(transactionEvent.contexts?.trace).toMatchObject({
    op: 'http.server',
    origin: 'auto.http.cloudflare',
    status: 'ok',
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

  expect(serverTraceId).toMatch(/[a-f0-9]{32}/);
  expect(clientTraceId).toMatch(/[a-f0-9]{32}/);
  expect(clientTraceId).toBe(serverTraceId);
});
