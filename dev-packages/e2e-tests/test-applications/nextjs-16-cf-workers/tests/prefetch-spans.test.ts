import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test('Prefetch client spans should have a http.request.prefetch attribute', async ({ page }) => {
  test.skip(isDevMode, "Prefetch requests don't have the prefetch header in dev mode");

  // The prefetch span is a child of the pageload segment span, which ends last.
  const spansPromise = collectStreamedSpans('nextjs-16-cf-workers', spans =>
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
