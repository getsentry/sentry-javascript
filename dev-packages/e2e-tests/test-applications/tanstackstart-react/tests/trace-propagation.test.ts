import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

test.describe('Trace propagation', () => {
  test('should inject metatags in ssr pageload', async ({ page }) => {
    await page.goto('/');

    const sentryTraceContent = await page.getAttribute('meta[name="sentry-trace"]', 'content');
    expect(sentryTraceContent).toBeDefined();
    expect(sentryTraceContent).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);

    const baggageContent = await page.getAttribute('meta[name="baggage"]', 'content');
    expect(baggageContent).toBeDefined();
    expect(baggageContent).toContain('sentry-environment=qa');
    expect(baggageContent).toContain('sentry-public_key=');
    expect(baggageContent).toContain('sentry-trace_id=');
    expect(baggageContent).toContain('sentry-sampled=');
  });

  test('should have trace connection between server and client', async ({ page }) => {
    const serverTxPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
      return transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /';
    });

    const clientTxPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
      return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
    });

    await page.goto('/');

    const serverTx = await serverTxPromise;
    const clientTx = await clientTxPromise;

    expect(clientTx.contexts?.trace?.trace_id).toBe(serverTx.contexts?.trace?.trace_id);
  });
});
