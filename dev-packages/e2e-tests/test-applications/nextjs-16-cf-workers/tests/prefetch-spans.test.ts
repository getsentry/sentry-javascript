import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

// TODO(https://github.com/opennextjs/opennextjs-cloudflare/issues/1141): Unskip once opennext supports prefetch-hints.json
test.skip('Prefetch client spans should have a http.request.prefetch attribute', async ({ page }) => {
  test.skip(isDevMode, "Prefetch requests don't have the prefetch header in dev mode");

  const pageloadTransactionPromise = waitForTransaction('nextjs-16-cf-workers', async transactionEvent => {
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
