import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

test('should parametrize server and client transaction names for dynamic routes', async ({ page }) => {
  const serverTxPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      typeof transactionEvent?.transaction === 'string' &&
      transactionEvent.transaction.includes('/param/')
    );
  });

  const clientTxPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'pageload' &&
      typeof transactionEvent?.transaction === 'string' &&
      transactionEvent.transaction.includes('/param/')
    );
  });

  await page.goto('/param/42');

  const serverTx = await serverTxPromise;
  const clientTx = await clientTxPromise;

  expect(serverTx.transaction).toBe('GET /param/$id');
  expect(serverTx.transaction_info?.source).toBe('route');

  expect(clientTx.transaction).toBe('/param/$id');
  expect(clientTx.transaction_info?.source).toBe('route');
});

test('should parametrize server and client transaction names for nested dynamic routes', async ({ page }) => {
  const serverTxPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      typeof transactionEvent?.transaction === 'string' &&
      transactionEvent.transaction.includes('/users/')
    );
  });

  const clientTxPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'pageload' &&
      typeof transactionEvent?.transaction === 'string' &&
      transactionEvent.transaction.includes('/users/')
    );
  });

  await page.goto('/users/123');

  const serverTx = await serverTxPromise;
  const clientTx = await clientTxPromise;

  expect(serverTx.transaction).toBe('GET /users/$userId');
  expect(serverTx.transaction_info?.source).toBe('route');

  expect(clientTx.transaction).toBe('/users/$userId');
  expect(clientTx.transaction_info?.source).toBe('route');
});

test('should parametrize API route transaction names', async ({ baseURL }) => {
  const serverTxPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      typeof transactionEvent?.transaction === 'string' &&
      transactionEvent.transaction.includes('/api/user/')
    );
  });

  await fetch(`${baseURL}/api/user/456`);

  const serverTx = await serverTxPromise;

  expect(serverTx.transaction).toBe('GET /api/user/$id');
  expect(serverTx.transaction_info?.source).toBe('route');
});
