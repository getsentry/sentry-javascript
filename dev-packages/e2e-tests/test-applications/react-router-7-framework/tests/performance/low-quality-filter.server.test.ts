import { test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('low-quality transaction filter', () => {
  test('does not send a server transaction for /__manifest? requests', async ({ page }) => {
    // Positive anchor: the navigation transaction we know the framework emits
    const navigationPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/ssr' && transactionEvent.contexts?.trace?.op === 'navigation'
      );
    });

    // Negative: throw if a server txn for /__manifest? sneaks through
    waitForTransaction(APP_NAME, async evt => {
      if (evt.transaction?.match(/GET \/__manifest\?/)) {
        throw new Error('Filtered manifest server transaction should not be sent');
      }
      return false;
    });

    await page.goto('/performance'); // pageload
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'SSR Page' }).click(); // navigation → fetches /__manifest?

    await navigationPromise;
    await page.waitForTimeout(1000); // give late server txns a chance to flush
  });
});
