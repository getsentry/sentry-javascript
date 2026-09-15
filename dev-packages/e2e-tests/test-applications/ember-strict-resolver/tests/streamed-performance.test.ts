import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// Only the `ember-strict-resolver (streamed)` variant builds the app with `traceLifecycle: 'stream'`.
test.skip(process.env.E2E_TEST_TRACE_LIFECYCLE !== 'stream', 'requires the app built with span streaming');

test('preserves the route name on a streamed pageload', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-strict-resolver', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'pageload' &&
      span.attributes['sentry.origin']?.value === 'auto.pageload.ember'
    );
  });

  await page.goto('/');

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.attributes['router.navigation.route.id']).toEqual({ type: 'string', value: 'route:index' });
  expect(pageloadSpan.name).toBe('route:index');
});

test('preserves the route name on a streamed navigation', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-strict-resolver', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'pageload' &&
      span.attributes['sentry.origin']?.value === 'auto.pageload.ember'
    );
  });

  await page.goto('/');
  await pageloadSpanPromise;

  const navigationSpanPromise = waitForStreamedSpan('ember-strict-resolver', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['sentry.origin']?.value === 'auto.navigation.ember'
    );
  });

  await page.getByText('Tracing').click();
  await expect(page).toHaveURL(/\/tracing$/);

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.attributes['router.navigation.route.id']).toEqual({ type: 'string', value: 'route:tracing' });
  expect(navigationSpan.name).toBe('route:tracing');
});

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
