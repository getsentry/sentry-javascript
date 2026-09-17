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

test('names route hook spans after the hook and keeps the route as the description', async ({ page }) => {
  const modelSpanPromise = waitForStreamedSpan(
    'ember-strict-resolver',
    span =>
      getSpanOp(span) === 'function' &&
      span.attributes['code.function.name']?.value === 'model' &&
      span.attributes['sentry.description']?.value === 'slow-loading-route.index',
  );

  await page.goto('/tracing');
  await page.getByText('Transition to slow loading route').click();

  const modelSpan = await modelSpanPromise;

  expect(modelSpan.name).toBe('model');
  expect(modelSpan.attributes['code.function.name']).toEqual({ type: 'string', value: 'model' });
  expect(modelSpan.attributes['sentry.description']).toEqual({ type: 'string', value: 'slow-loading-route.index' });
  expect(modelSpan.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ui.ember' });
});
