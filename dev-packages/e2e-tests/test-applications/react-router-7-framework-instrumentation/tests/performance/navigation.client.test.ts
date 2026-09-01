import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// When `useInstrumentationAPI: true` is set and the instrumentations array is passed to
// HydratedRouter, React Router invokes the navigate hook on the client and the navigation span
// is created via the instrumentation API (origin: `auto.navigation.react_router.instrumentation_api`).
// The legacy `instrumentHydratedRouter()` subscribe callback still runs and updates the span
// name to its parameterized form (so `sentry.segment.name.source` ends up as `route`).
//
// See: https://github.com/remix-run/react-router/discussions/13749

test.describe('client - hybrid navigation (instrumentation API span + legacy parameterization)', () => {
  test('should create navigation span via instrumentation API and parameterize via legacy subscribe', async ({
    page,
  }) => {
    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`);
    await pageloadSpanPromise;

    const navigationSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/ssr' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    // Click on the SSR link to navigate
    await page.getByRole('link', { name: 'SSR Page' }).click();

    const span = await navigationSpanPromise;

    expect(span.attributes).toMatchObject({
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.origin': { value: 'auto.navigation.react_router.instrumentation_api', type: 'string' },
      'navigation.type': { value: 'router.navigate', type: 'string' },
      'url.template': { value: '/performance/ssr', type: 'string' },
      'url.path': { value: '/performance/ssr', type: 'string' },
      'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/ssr$/), type: 'string' },
    });
  });

  test('should resolve relative navigate targets against the current URL', async ({ page }) => {
    // Wait for the pageload span so we know the client has hydrated and the router is
    // instrumented before triggering the relative navigation (avoids a brittle fixed sleep).
    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`);
    await pageloadSpanPromise;

    const navigationSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/ssr' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    await page.getByRole('button', { name: 'Relative SSR Navigate' }).click();

    const span = await navigationSpanPromise;

    expect(span.attributes).toMatchObject({
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.origin': { value: 'auto.navigation.react_router.instrumentation_api', type: 'string' },
      'navigation.type': { value: 'router.navigate', type: 'string' },
      'url.template': { value: '/performance/ssr', type: 'string' },
      'url.path': { value: '/performance/ssr', type: 'string' },
      'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/ssr$/), type: 'string' },
    });
  });

  test('should parameterize navigation span for dynamic routes', async ({ page }) => {
    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`);
    await pageloadSpanPromise;

    const navigationSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/with/:param' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    await page.getByRole('link', { name: 'With Param Page' }).click();

    const span = await navigationSpanPromise;

    expect(span.attributes).toMatchObject({
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.origin': { value: 'auto.navigation.react_router.instrumentation_api', type: 'string' },
      'url.template': { value: '/performance/with/:param', type: 'string' },
      'url.path': { value: '/performance/with/sentry', type: 'string' },
      'url.full': {
        value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/sentry$/),
        type: 'string',
      },
    });
  });

  test('should send multiple navigation spans in sequence', async ({ page }) => {
    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`);
    await pageloadSpanPromise;

    // First navigation: /performance -> /performance/ssr
    const firstNavPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/ssr' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    await page.getByRole('link', { name: 'SSR Page' }).click();

    const firstNav = await firstNavPromise;

    expect(firstNav.name).toBe('/performance/ssr');
    expect(firstNav.attributes['sentry.origin']?.value).toBe('auto.navigation.react_router.instrumentation_api');

    // Second navigation: /performance/ssr -> /performance
    const secondNavPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    await page.getByRole('link', { name: 'Back to Performance' }).click();

    const secondNav = await secondNavPromise;

    expect(secondNav.name).toBe('/performance');
    expect(secondNav.attributes['sentry.origin']?.value).toBe('auto.navigation.react_router.instrumentation_api');
  });

  test('should create navigation span for navigate(-1) with correct url attributes', async ({ page }) => {
    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`);
    await pageloadSpanPromise;

    const forwardNavPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/ssr' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    await page.getByRole('link', { name: 'SSR Page' }).click();
    await forwardNavPromise;

    const backNavPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    await page.getByRole('button', { name: 'History Back Navigate' }).click();

    const span = await backNavPromise;

    expect(span.attributes).toMatchObject({
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.origin': { value: 'auto.navigation.react_router.instrumentation_api', type: 'string' },
      'navigation.type': { value: 'router.back', type: 'string' },
      'url.template': { value: '/performance', type: 'string' },
      // react-router-serve 301-redirects the bare index route to a trailing slash in prod, while
      // the dev server serves it without - accept both.
      'url.path': { value: expect.stringMatching(/^\/performance\/?$/), type: 'string' },
      'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/?$/), type: 'string' },
    });
  });
});

// Tests for instrumentation API navigation - expected to fail until React Router fixes upstream
test.describe('client - instrumentation API navigation (upstream limitation)', () => {
  test.fixme('should send navigation span with instrumentation API origin', async ({ page }) => {
    // First load the performance page
    await page.goto(`/performance`);

    // Wait for the navigation span. Without the parameterization the streamed name falls back to
    // the low-cardinality `Navigation`.
    const navigationSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return (
        span.name === 'Navigation' &&
        span.attributes['sentry.origin']?.value === 'auto.navigation.react_router.instrumentation_api'
      );
    });

    // Click on the SSR link to navigate
    await page.getByRole('link', { name: 'SSR Page' }).click();

    const span = await navigationSpanPromise;

    expect(span.span_id).toEqual(expect.any(String));
    expect(span.trace_id).toEqual(expect.any(String));
    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.origin': { value: 'auto.navigation.react_router.instrumentation_api', type: 'string' },
      'sentry.segment.name.source': { value: 'url', type: 'string' },
      'url.path': { value: '/performance/ssr', type: 'string' },
    });
  });

  test.fixme('should send navigation span on parameterized route', async ({ page }) => {
    // First load the performance page
    await page.goto(`/performance`);

    // Wait for the navigation span. Without the parameterization the streamed name falls back to
    // the low-cardinality `Navigation`.
    const navigationSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return (
        span.name === 'Navigation' &&
        span.attributes['sentry.origin']?.value === 'auto.navigation.react_router.instrumentation_api'
      );
    });

    // Click on the With Param link to navigate
    await page.getByRole('link', { name: 'With Param Page' }).click();

    const span = await navigationSpanPromise;

    expect(span.span_id).toEqual(expect.any(String));
    expect(span.trace_id).toEqual(expect.any(String));
    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.origin': { value: 'auto.navigation.react_router.instrumentation_api', type: 'string' },
      'sentry.segment.name.source': { value: 'url', type: 'string' },
      'url.path': { value: '/performance/with/sentry', type: 'string' },
    });
  });
});
