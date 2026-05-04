import { expect, test } from '@playwright/test';
import { waitForRootSpan } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test('Prefetch client spans should have a http.request.prefetch attribute', async ({ page }) => {
  test.skip(isDevMode, "Prefetch requests don't have the prefetch header in dev mode");

  const pageloadRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === '/prefetching';
  });

  await page.goto(`/prefetching`);

  // Make it more likely that nextjs prefetches
  await page.hover('#prefetch-link');

  const rootSpan = await pageloadRootSpanPromise;

  expect(rootSpan.childSpans).toContainEqual(
    expect.objectContaining({
      op: 'http.client',
      attributes: expect.objectContaining({
        'http.request.prefetch': true,
      }),
    }),
  );
});
