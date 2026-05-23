import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

test('should parametrize server transaction names for dynamic routes', async ({ page }) => {
  const serverTxPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      typeof transactionEvent?.transaction === 'string' &&
      transactionEvent.transaction.includes('/param/')
    );
  });

  await page.goto('/param/42');

  const serverTx = await serverTxPromise;

  expect(serverTx.transaction).toBe('GET /param/$id');
});

test('should parametrize server transaction names for nested dynamic routes', async ({ page }) => {
  const serverTxPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      typeof transactionEvent?.transaction === 'string' &&
      transactionEvent.transaction.includes('/users/')
    );
  });

  await page.goto('/users/123');

  const serverTx = await serverTxPromise;

  expect(serverTx.transaction).toBe('GET /users/$userId');
});
