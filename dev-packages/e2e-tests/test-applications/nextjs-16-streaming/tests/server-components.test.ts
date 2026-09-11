import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

// Next.js emits these spans itself. The SDK attaches no op, description or function name to
// them, so asserting `undefined` pins that they stay untouched.
const nextjsSpan = { op: undefined, description: undefined, codeFunctionName: undefined };

test('Sends a streamed span for a request to app router with URL', async ({ page }) => {
  test.skip(isDevMode, 'Turbopack intermittently returns 404 for nested dynamic routes in dev mode');

  const rootSpanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === 'GET /parameterized/[one]/beep/[two]' && span.is_segment;
  });

  await page.goto('/parameterized/1337/beep/42');

  const rootSpan = await rootSpanPromise;

  expect(getSpanOp(rootSpan)).toBe('http.server');
  expect(rootSpan.status).toBe('ok');
});

test('Will create streamed spans for every server component and metadata generation functions when visiting a page', async ({
  page,
}) => {
  test.skip(isDevMode, 'Turbopack intermittently returns 404 for nested dynamic routes in dev mode');

  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16-streaming', 'GET /nested-layout');

  await page.goto('/nested-layout');

  const fullSpans = await spansPromise;
  const spans = fullSpans.map(span => ({
    name: span.name,
    op: getSpanOp(span),
    description: span.attributes['sentry.description']?.value,
    codeFunctionName: span.attributes['code.function.name']?.value,
  }));

  expect(spans).toContainEqual({ ...nextjsSpan, name: 'render route (app) /nested-layout' });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'build component tree' });
  // Server component spans: the name is the low-cardinality `code.function.name`, and the
  // segment each one resolved for is on the description.
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve root layout server component',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "(nested-layout)"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "nested-layout"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Page',
    op: 'function',
    description: 'resolve page server component "/nested-layout"',
    codeFunctionName: 'Page',
  });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'generateMetadata /(nested-layout)/nested-layout/page' });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'start response' });

  // The route detail that the low-cardinality name no longer carries stays on attributes.
  const pageSpan = fullSpans.find(
    span => span.attributes['sentry.description']?.value === 'resolve page server component "/nested-layout"',
  )!;
  expect(pageSpan.attributes).toMatchObject({
    'sentry.nextjs.ssr.function.type': { value: 'Page', type: 'string' },
    'sentry.nextjs.ssr.function.route': { value: '/nested-layout', type: 'string' },
    'http.route': { value: '/nested-layout', type: 'string' },
  });
});

test('Will create streamed spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  test.skip(isDevMode, 'Turbopack intermittently returns 404 for nested dynamic routes in dev mode');

  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16-streaming', 'GET /nested-layout/[dynamic]');

  await page.goto('/nested-layout/123');

  const fullSpans = await spansPromise;
  const spans = fullSpans.map(span => ({
    name: span.name,
    op: getSpanOp(span),
    description: span.attributes['sentry.description']?.value,
    codeFunctionName: span.attributes['code.function.name']?.value,
  }));

  expect(spans).toContainEqual({ ...nextjsSpan, name: 'resolve page components' });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'render route (app) /nested-layout/[dynamic]' });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'build component tree' });
  // Server component spans: the name is the low-cardinality `code.function.name`, and the
  // segment each one resolved for is on the description.
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve root layout server component',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "(nested-layout)"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "nested-layout"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "[dynamic]"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Page',
    op: 'function',
    description: 'resolve page server component "/nested-layout/[dynamic]"',
    codeFunctionName: 'Page',
  });
  expect(spans).toContainEqual({
    ...nextjsSpan,
    name: 'generateMetadata /(nested-layout)/nested-layout/[dynamic]/page',
  });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'start response' });
});
