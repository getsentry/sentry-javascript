import { test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create a transaction for a CJS pages router API endpoint', async ({ page }) => {
  let received404Transaction = false;
  waitForTransaction('nextjs-13', async transactionEvent => {
    return transactionEvent.transaction === 'GET /404' || transactionEvent.transaction === 'GET /_not-found';
  }).then(() => {
    received404Transaction = true;
  });

  await page.goto('/page-that-doesnt-exist');

  await new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      if (received404Transaction) {
        reject(new Error('received 404 transaction'));
      } else {
        resolve();
      }
    }, 5_000);
  });
});
