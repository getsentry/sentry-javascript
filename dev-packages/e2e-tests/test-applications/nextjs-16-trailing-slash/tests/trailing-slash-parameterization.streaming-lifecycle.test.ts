import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// These tests verify that pageload spans are correctly named when
// trailingSlash: true is enabled in next.config.mjs, even when a catch-all
// route exists. See: https://github.com/getsentry/sentry-javascript/issues/19241

test('should create a correctly named pageload span for a static route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-trailing-slash', span => {
    return span.name === '/static-page' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/static-page`);

  const span = await spanPromise;

  expect(span.name).toBe('/static-page');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/static-page', type: 'string' },
  });
});

test('should create a correctly named pageload span for a parameterized route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-trailing-slash', span => {
    return span.name === '/parameterized/:param' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/some-value`);

  const span = await spanPromise;

  expect(span.name).toBe('/parameterized/:param');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });
});

test('should create a correctly named pageload span for a static nested route under parameterized', async ({
  page,
}) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-trailing-slash', span => {
    return span.name === '/parameterized/static' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/static`);

  const span = await spanPromise;

  expect(span.name).toBe('/parameterized/static');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/parameterized/static', type: 'string' },
  });
});

test('should create a correctly named pageload span for the catch-all route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-trailing-slash', span => {
    return span.name === '/:slug*' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/some/unmatched/path`);

  const span = await spanPromise;

  expect(span.name).toBe('/:slug*');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });
});

test('should create a correctly named pageload span for the home page', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-trailing-slash', span => {
    return span.name === '/' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/`);

  const span = await spanPromise;

  expect(span.name).toBe('/');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
  });
});
