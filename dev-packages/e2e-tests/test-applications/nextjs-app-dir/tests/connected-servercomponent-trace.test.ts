import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';

// Next.js emits these spans itself. The SDK attaches no op, description or function name to
// them, so asserting `undefined` pins that they stay untouched.
const nextjsSpan = { op: undefined, description: undefined, codeFunctionName: undefined };

test('Will create spans for every server component and metadata generation functions when visiting a page', async ({
  page,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-app-dir', 'GET /nested-layout');

  await page.goto('/nested-layout');

  const fullSpans = await spansPromise;
  const spans = fullSpans.map(span => ({
    name: span.name,
    op: getSpanOp(span),
    description: span.attributes['sentry.description']?.value,
    codeFunctionName: span.attributes['code.function.name']?.value,
  }));

  expect(spans).toContainEqual({ ...nextjsSpan, name: 'render route (app) /nested-layout' });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'generateMetadata /(nested-layout)/nested-layout/page' });

  expect(spans).toContainEqual({ ...nextjsSpan, name: 'resolve page components' });
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
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'start response' });
});

test('Will create spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-app-dir', 'GET /nested-layout/[dynamic]');

  await page.goto('/nested-layout/123');

  const fullSpans = await spansPromise;
  const spans = fullSpans.map(span => ({
    name: span.name,
    op: getSpanOp(span),
    description: span.attributes['sentry.description']?.value,
    codeFunctionName: span.attributes['code.function.name']?.value,
  }));

  expect(spans).toContainEqual({ ...nextjsSpan, name: 'render route (app) /nested-layout/[dynamic]' });
  expect(spans).toContainEqual({
    ...nextjsSpan,
    name: 'generateMetadata /(nested-layout)/nested-layout/[dynamic]/page',
  });

  expect(spans).toContainEqual({ ...nextjsSpan, name: 'resolve page components' });
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
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'start response' });
});
