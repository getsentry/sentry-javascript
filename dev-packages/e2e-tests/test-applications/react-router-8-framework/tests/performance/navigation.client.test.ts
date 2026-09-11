import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('client - navigation performance', () => {
  test('should create navigation span', async ({ page }) => {
    const navigationSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/ssr' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`); // pageload
    await pageloadSpanPromise;
    await page.getByRole('link', { name: 'SSR Page' }).click(); // navigation

    const span = await navigationSpanPromise;

    expect(span).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: true,
      status: 'ok',
    });

    expect(span.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.navigation.react_router', type: 'string' },
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.react-router', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
      'sentry.sdk.integrations': { value: expect.arrayContaining([expect.any(String)]), type: 'array' },
      'url.template': { value: '/performance/ssr', type: 'string' },
      'url.path': { value: '/performance/ssr', type: 'string' },
      'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/ssr$/), type: 'string' },
    });
  });

  test('should create navigation span when navigating with object `to` prop', async ({ page }) => {
    const navigationSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/with/:param' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`); // pageload
    await pageloadSpanPromise;
    await page.getByRole('link', { name: 'Object Navigate' }).click(); // navigation with object to

    const span = await navigationSpanPromise;

    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.origin': { value: 'auto.navigation.react_router', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'url.template': { value: '/performance/with/:param', type: 'string' },
      'url.path': { value: '/performance/with/object-nav', type: 'string' },
      'url.full': {
        value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/object-nav\?foo=bar$/),
        type: 'string',
      },
    });
  });

  test('should create navigation span when navigating with search-only object `to` prop', async ({ page }) => {
    const navigationSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`); // pageload
    await pageloadSpanPromise;
    await page.getByRole('link', { name: 'Search Only Navigate' }).click(); // navigation with search-only object to

    const span = await navigationSpanPromise;

    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.origin': { value: 'auto.navigation.react_router', type: 'string' },
      'url.template': { value: '/performance', type: 'string' },
      // the initial pageload to `/performance` gets 301-redirected to a trailing slash by react-router-serve
      'url.path': { value: '/performance/', type: 'string' },
      'url.full': {
        value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/\?query=test$/),
        type: 'string',
      },
    });
  });

  test('should update navigation span for dynamic routes', async ({ page }) => {
    const navigationSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/with/:param' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`); // pageload
    await pageloadSpanPromise;
    await page.getByRole('link', { name: 'With Param Page' }).click(); // navigation

    const span = await navigationSpanPromise;

    expect(span).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: true,
      status: 'ok',
    });

    expect(span.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.navigation.react_router', type: 'string' },
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.react-router', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
      'sentry.sdk.integrations': { value: expect.arrayContaining([expect.any(String)]), type: 'array' },
      'url.template': { value: '/performance/with/:param', type: 'string' },
      'url.path': { value: '/performance/with/sentry', type: 'string' },
      'url.full': {
        value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/sentry$/),
        type: 'string',
      },
    });
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
      'sentry.origin': { value: 'auto.navigation.react_router', type: 'string' },
      'url.template': { value: '/performance', type: 'string' },
      // react-router-serve 301-redirects the bare index route to a trailing slash
      'url.path': { value: '/performance/', type: 'string' },
      'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/$/), type: 'string' },
    });
  });
});
