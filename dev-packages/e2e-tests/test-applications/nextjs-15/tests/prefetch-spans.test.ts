import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';

test('Prefetch client spans should have a http.request.prefetch attribute', async ({ page }) => {
  test.skip(
    process.env.TEST_ENV === 'development' || process.env.TEST_ENV === 'dev-turbopack',
    "Prefetch requests don't have the prefetch header in dev mode",
  );

  // The prefetch span is a child of the pageload segment span, which ends last.
  const spansPromise = collectStreamedSpans('nextjs-15', spans =>
    spans.some(span => span.name === '/prefetching' && span.is_segment),
  );

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
