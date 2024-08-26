import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('should not capture React-internal errors for PPR rendering', async ({ page }) => {
  const pageServerComponentTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /ppr-error/[param]';
  });

  let errorEventReceived = false;
  waitForError('nextjs-15', async errorEvent => {
    return errorEvent?.transaction === 'Page Server Component (/ppr-error/[param])';
  }).then(() => {
    errorEventReceived = true;
  });

  await page.goto(`/ppr-error/foobar?id=1`);

  const pageServerComponentTransaction = await pageServerComponentTransactionPromise;
  expect(pageServerComponentTransaction).toBeDefined();

  expect(errorEventReceived).toBe(false);
});
