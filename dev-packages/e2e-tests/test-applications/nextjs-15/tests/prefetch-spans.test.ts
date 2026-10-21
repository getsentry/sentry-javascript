import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Prefetch client spans should have a http.request.prefetch attribute', async ({ page }) => {
  test.skip(
    process.env.TEST_ENV === 'development' || process.env.TEST_ENV === 'dev-turbopack',
    "Prefetch requests don't have the prefetch header in dev mode",
  );

  // The prefetch span is a child of the pageload segment span, which ends last.
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-15', '/prefetching');

  await page.goto(`/prefetching`);

  // Make it more likely that nextjs prefetches
  await page.hover('#prefetch-link');

  const spans = await spansPromise;

  expect(spans).toContainEqual(
    expect.objectContaining({
      attributes: expect.objectContaining({
        'sentry.op': { value: 'http.client', type: 'string' },
        'http.request.prefetch': { value: true, type: 'boolean' },
      }),
    }),
  );
});
