import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('should not capture React-internal errors for cached components', async ({ page }) => {
  test.skip(process.env.CANARY_BUILD === 'true', 'needs to run on latest canary version');

  const pageServerComponentTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /ppr-error/[param]';
  });

  let errorEventReceived = false;
  waitForError('nextjs-16', async errorEvent => {
    return errorEvent?.transaction === 'Page Server Component (/cached-components-error/[param])';
  }).then(() => {
    errorEventReceived = true;
  });

  await page.goto(`/cached-components-error/foobar?id=1`);

  const pageServerComponentTransaction = await pageServerComponentTransactionPromise;
  expect(pageServerComponentTransaction).toBeDefined();

  expect(errorEventReceived).toBe(false);
});
