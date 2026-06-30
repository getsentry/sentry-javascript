import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('low-quality transaction filter', () => {
  test('does not send a server transaction for /__manifest? requests', async ({ page }) => {
    const serverTxns: Array<{ contexts?: { trace?: { data?: Record<string, unknown> } } }> = [];

    const navigationPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/ssr' && transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    waitForTransaction(APP_NAME, async evt => {
      serverTxns.push(evt);
      return false;
    });

    await page.goto('/performance');
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'SSR Page' }).click();

    await navigationPromise;

    // Force the server to flush any in-flight transactions before we assert
    await page.evaluate(() => fetch('/__sentry-flush'));

    const targetIsManifest = (t: (typeof serverTxns)[number]) =>
      typeof t.contexts?.trace?.data?.['http.target'] === 'string' &&
      (t.contexts.trace.data['http.target'] as string).includes('/__manifest');
    expect(serverTxns.some(targetIsManifest)).toBe(false);
  });
});
