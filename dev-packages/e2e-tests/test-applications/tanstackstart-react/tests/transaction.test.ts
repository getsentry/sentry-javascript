import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

function isServerFnSegment(span: Parameters<typeof getSpanOp>[0]): boolean {
  return (
    !!span.is_segment &&
    getSpanOp(span) === 'http.server' &&
    String(span.attributes['url.path']?.value ?? '').startsWith('/_serverFn')
  );
}

test('Sends a server function span with auto-instrumentation', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    'tanstackstart-react',
    spans => spans.some(isServerFnSegment) && spans.some(span => span.name === 'GET /_serverFn/testLog'),
  );

  await page.goto('/test-serverFn');

  await expect(page.getByText('Call server function', { exact: true })).toBeVisible();

  await page.getByText('Call server function', { exact: true }).click();

  const spans = await spansPromise;

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'GET /_serverFn/testLog',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'function' },
          'sentry.origin': { type: 'string', value: 'auto.function.tanstackstart.server' },
          'tanstackstart.function.filename': { type: 'string', value: 'src/routes/test-serverFn.tsx' },
        }),
      }),
    ]),
  );
});

test('Sends a server function span for a nested server function only if it is manually instrumented', async ({
  page,
}) => {
  const spansPromise = collectStreamedSpans(
    'tanstackstart-react',
    spans =>
      spans.some(isServerFnSegment) &&
      spans.some(span => span.name === 'GET /_serverFn/testNestedLog') &&
      spans.some(span => span.name === 'testNestedLog') &&
      spans.some(span => span.name === 'globalFunctionMiddleware'),
  );

  await page.goto('/test-serverFn');

  await expect(page.getByText('Call server function nested')).toBeVisible();

  await page.getByText('Call server function nested').click();

  const spans = await spansPromise;

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'GET /_serverFn/testNestedLog',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'function' },
          'sentry.origin': { type: 'string', value: 'auto.function.tanstackstart.server' },
          'tanstackstart.function.filename': { type: 'string', value: 'src/routes/test-serverFn.tsx' },
        }),
      }),
    ]),
  );

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'testNestedLog',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: 'manual' },
        }),
      }),
    ]),
  );

  const functionMiddlewareSpan = spans.find(
    span =>
      span.name === 'globalFunctionMiddleware' &&
      span.attributes['sentry.origin']?.value === 'auto.middleware.tanstackstart',
  );
  const nestedSpan = spans.find(
    span => span.name === 'testNestedLog' && span.attributes['sentry.origin']?.value === 'manual',
  );

  expect(functionMiddlewareSpan).toBeDefined();
  expect(nestedSpan).toBeDefined();
  expect(nestedSpan?.parent_span_id).toBe(functionMiddlewareSpan?.parent_span_id);
});
