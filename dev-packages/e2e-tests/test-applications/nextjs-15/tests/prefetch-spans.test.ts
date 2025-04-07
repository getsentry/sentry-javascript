import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Prefetch client spans should have the right op', async ({ page }) => {
  const pageloadTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === '/prefetching';
  });

  await page.goto(`/prefetching`);

  // Make it more likely that nextjs prefetches
  await page.hover('#prefetch-link');

  expect((await pageloadTransactionPromise).spans).toContainEqual(
    expect.objectContaining({
      op: 'http.client',
      data: expect.objectContaining({
        'http.request.prefetch': true,
      }),
    }),
  );
});
