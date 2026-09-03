import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// Only the `ember-strict-resolver (streamed)` variant builds the app with `traceLifecycle: 'stream'`.
test.skip(process.env.E2E_TEST_TRACE_LIFECYCLE !== 'stream', 'requires the app built with span streaming');

test('names the transition span with the low cardinality fallback', async ({ page }) => {
  const transitionSpanPromise = waitForStreamedSpan('ember-strict-resolver', span => getSpanOp(span) === 'router');

  await page.goto('/');
  await page.getByText('Tracing').click();

  const transitionSpan = await transitionSpanPromise;

  // The route pair (`route:index -> route:tracing`) is not one of the convention's name templates,
  // so a streamed router span takes the static fallback instead.
  expect(transitionSpan.name).toBe('Router');
  expect(transitionSpan.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ui.ember' });
});
