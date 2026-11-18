import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test.slow(isDevMode, 'Next.js compiles the tRPC routes on their first request in dev mode');

test('should create span with trpc input for mutation', async ({ page }) => {
  const trpcSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'POST /api/trpc/[trpc]' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  await page.goto('/trpc');
  await page.locator('#createInput').fill('I love dogs');
  await page.click('#createButton');

  const trpcSpan = await trpcSpanPromise;

  expect(trpcSpan).toBeDefined();
});
