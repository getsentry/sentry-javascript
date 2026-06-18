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
      description: 'GET /_serverFn/testLog',
      op: 'function.tanstackstart',
      origin: 'auto.function.tanstackstart.server',
      data: {
        'sentry.op': 'function.tanstackstart',
        'sentry.origin': 'auto.function.tanstackstart.server',
        'sentry.source': 'route',
        'tanstackstart.function.id': expect.any(String),
        'tanstackstart.function.filename': 'src/routes/test-serverFn.tsx',
      },
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
        description: 'GET /_serverFn/testNestedLog',
        op: 'function.tanstackstart',
        origin: 'auto.function.tanstackstart.server',
        data: {
          'sentry.op': 'function.tanstackstart',
          'sentry.origin': 'auto.function.tanstackstart.server',
          'sentry.source': 'route',
          'tanstackstart.function.id': expect.any(String),
          'tanstackstart.function.filename': 'src/routes/test-serverFn.tsx',
        },
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
