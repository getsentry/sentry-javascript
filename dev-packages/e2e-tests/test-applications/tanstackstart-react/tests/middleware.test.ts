import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

function isHttpServerPath(span: Parameters<typeof getSpanOp>[0], path: string | ((value: string) => boolean)): boolean {
  if (!span.is_segment || getSpanOp(span) !== 'http.server') {
    return false;
  }
  const urlPath = String(span.attributes['url.path']?.value ?? '');
  return typeof path === 'function' ? path(urlPath) : urlPath === path;
}

test('Sends spans for multiple middlewares and verifies they are siblings under the same parent span', async ({
  page,
}) => {
  const spansPromise = collectStreamedSpans('tanstackstart-react', spans => {
    return (
      spans.some(span => isHttpServerPath(span, p => p.startsWith('/_serverFn'))) &&
      spans.some(span => span.name === 'serverFnMiddleware') &&
      spans.some(span => span.name === 'globalFunctionMiddleware')
    );
  });

  await page.goto('/test-middleware');
  await expect(page.locator('#server-fn-middleware-btn')).toBeVisible();
  await page.locator('#server-fn-middleware-btn').click();

  const spans = await spansPromise;

  const serverFnMiddlewareSpan = spans.find(
    span =>
      span.name === 'serverFnMiddleware' && span.attributes['sentry.origin']?.value === 'auto.middleware.tanstackstart',
  );
  const globalFunctionMiddlewareSpan = spans.find(
    span =>
      span.name === 'globalFunctionMiddleware' &&
      span.attributes['sentry.origin']?.value === 'auto.middleware.tanstackstart',
  );

  expect(serverFnMiddlewareSpan).toMatchObject({
    name: 'serverFnMiddleware',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.tanstackstart' },
    }),
  });
  expect(globalFunctionMiddlewareSpan).toMatchObject({
    name: 'globalFunctionMiddleware',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.tanstackstart' },
    }),
  });

  expect(serverFnMiddlewareSpan?.parent_span_id).toBe(globalFunctionMiddlewareSpan?.parent_span_id);
});

test('Sends spans for global function middleware', async ({ page }) => {
  const spansPromise = collectStreamedSpans('tanstackstart-react', spans => {
    return (
      spans.some(span => isHttpServerPath(span, p => p.startsWith('/_serverFn'))) &&
      spans.some(span => span.name === 'globalFunctionMiddleware')
    );
  });

  await page.goto('/test-middleware');
  await expect(page.locator('#server-fn-global-only-btn')).toBeVisible();
  await page.locator('#server-fn-global-only-btn').click();

  const spans = await spansPromise;

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'globalFunctionMiddleware',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'middleware' },
          'sentry.origin': { type: 'string', value: 'auto.middleware.tanstackstart' },
        }),
      }),
    ]),
  );
});

test('Sends spans for global request middleware', async ({ page }) => {
  const spansPromise = collectStreamedSpans('tanstackstart-react', spans => {
    return (
      spans.some(span => isHttpServerPath(span, '/test-middleware')) &&
      spans.some(span => span.name === 'globalRequestMiddleware')
    );
  });

  await page.goto('/test-middleware');

  const spans = await spansPromise;

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'globalRequestMiddleware',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'middleware' },
          'sentry.origin': { type: 'string', value: 'auto.middleware.tanstackstart' },
        }),
      }),
    ]),
  );
});

test('Sends spans for server route request middleware', async ({ page }) => {
  const spansPromise = collectStreamedSpans('tanstackstart-react', spans => {
    return (
      spans.some(span => isHttpServerPath(span, '/api/test-middleware')) &&
      spans.some(span => span.name === 'serverRouteRequestMiddleware')
    );
  });

  await page.goto('/api/test-middleware');

  const spans = await spansPromise;

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'serverRouteRequestMiddleware',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'middleware' },
          'sentry.origin': { type: 'string', value: 'auto.middleware.tanstackstart' },
        }),
      }),
    ]),
  );
});

test('Sends span for middleware that returns early without calling next()', async ({ page }) => {
  const spansPromise = collectStreamedSpans('tanstackstart-react', spans => {
    return (
      spans.some(span => isHttpServerPath(span, p => p.startsWith('/_serverFn'))) &&
      spans.some(span => span.name === 'earlyReturnMiddleware')
    );
  });

  await page.goto('/test-middleware');
  await expect(page.locator('#server-fn-early-return-btn')).toBeVisible();
  await page.locator('#server-fn-early-return-btn').click();

  const spans = await spansPromise;

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'earlyReturnMiddleware',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'middleware' },
          'sentry.origin': { type: 'string', value: 'auto.middleware.tanstackstart' },
        }),
      }),
    ]),
  );
});

test('Sends span for middleware that throws an error', async ({ page }) => {
  const spansPromise = collectStreamedSpans('tanstackstart-react', spans => {
    return (
      spans.some(span => isHttpServerPath(span, p => p.startsWith('/_serverFn'))) &&
      spans.some(span => span.name === 'errorMiddleware')
    );
  });

  await page.goto('/test-middleware');
  await expect(page.locator('#server-fn-error-btn')).toBeVisible();
  await page.locator('#server-fn-error-btn').click();

  const spans = await spansPromise;

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'errorMiddleware',
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: 'auto.middleware.tanstackstart' },
        }),
      }),
    ]),
  );
});
