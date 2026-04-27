import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import type { Event } from '@sentry/core';
import { APP_NAME } from '../constants';

test.describe('low-quality transaction filter', () => {
  test('does not send a server transaction for /__manifest? requests', async ({ page }) => {
    const serverTxns: Event[] = [];

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
    await page.getByRole('link', { name: 'SSR Page' }).click();

    await navigationPromise;

    expect(serverTxns.some(t => t.transaction?.match(/GET \/__manifest\?/))).toBe(false);
  });
});
