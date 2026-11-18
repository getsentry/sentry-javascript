import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// Only the `angular-19 (streamed)` variant builds the app with `traceLifecycle: 'stream'`.
test.skip(process.env.E2E_TEST_TRACE_LIFECYCLE !== 'stream', 'requires the app built with span streaming');

test('names the routing span with the low cardinality fallback', async ({ page }) => {
  const routingSpanPromise = waitForStreamedSpan('angular-19', span => getSpanOp(span) === 'router');

  await page.goto('/');
  await page.locator('#navLink').click();

  const routingSpan = await routingSpanPromise;

  // The routing span starts at `NavigationStart`, where only the raw URL (`/users/123`) is known.
  // Angular resolves the parameterized route at `ResolveEnd` and applies it to the root span, so a
  // streamed routing span has nothing low cardinality to use and takes the static fallback.
  expect(routingSpan.name).toBe('Router');
  expect(routingSpan.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ui.angular' });
});
