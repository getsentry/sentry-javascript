import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';

test('should not capture serverside suspense errors', async ({ page }) => {
  const pageServerComponentTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/suspense-error)';
  });

  let errorEvent;
  waitForError('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/suspense-error)';
  }).then(event => {
    errorEvent = event;
  });

  await page.goto(`/suspense-error`);

  await page.waitForTimeout(5000);

  const pageServerComponentTransaction = await pageServerComponentTransactionPromise;
  expect(pageServerComponentTransaction).toBeDefined();

  expect(errorEvent).toBeUndefined();
});
