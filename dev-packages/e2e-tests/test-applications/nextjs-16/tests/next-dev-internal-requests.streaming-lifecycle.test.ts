import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

const NEXT_DEV_REQUEST_URL =
  /^https:\/\/(telemetry\.nextjs\.org\/api\/v1\/record|registry\.npmjs\.org\/-\/package\/next\/dist-tags)$/;

test('Sends no spans for the telemetry and version check requests of `next dev`', async ({ page }) => {
  test.skip(!isDevMode, '`next dev` sends these requests only in development');

  // `next dev` sends its telemetry at startup, before any test runs, so the search starts at the first envelope.
  const nextDevRequestSpanPromise = waitForStreamedSpan(
    'nextjs-16',
    span => {
      const url = span.attributes['url.full']?.value;
      return getSpanOp(span) === 'http.client' && typeof url === 'string' && NEXT_DEV_REQUEST_URL.test(url);
    },
    0,
  );

  // The dev overlay connects to the dev server, which then runs the version check.
  await page.goto('/');

  const result = await Promise.race([
    nextDevRequestSpanPromise.then(span => span.name),
    new Promise(resolve => setTimeout(() => resolve('timeout'), 5000)),
  ]);
  expect(result).toBe('timeout');
});
