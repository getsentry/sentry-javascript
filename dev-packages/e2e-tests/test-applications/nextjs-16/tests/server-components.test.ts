import { expect, test } from '@playwright/test';
import { collectSpanNamesUntilSegment, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';
import { isTurbopackDevMode } from './isDevMode';

test('Sends a span for a request to app router with URL', async ({ page }) => {
  test.skip(isTurbopackDevMode, 'Turbopack intermittently returns 404 for nested dynamic routes in dev mode');

  const spansPromise = collectStreamedSpansUntilSegment(
    'nextjs-16',
    span =>
      span.name === 'GET /parameterized/[one]/beep/[two]' &&
      String(span.attributes['http.target']?.value).startsWith('/parameterized/1337/beep/42'),
  );

  await page.goto('/parameterized/1337/beep/42');

  const spans = await spansPromise;
  const segmentSpan = spans.find(
    span =>
      span.name === 'GET /parameterized/[one]/beep/[two]' &&
      span.is_segment &&
      String(span.attributes['http.target']?.value).startsWith('/parameterized/1337/beep/42'),
  )!;

  expect(segmentSpan.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(segmentSpan.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(segmentSpan.status).toBe('ok');
  expect(segmentSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'http.method': { value: 'GET', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'http.route': { value: '/parameterized/[one]/beep/[two]', type: 'string' },
    'http.status_code': { value: 200, type: 'integer' },
    'http.target': { value: '/parameterized/1337/beep/42', type: 'string' },
    'sentry.kind': { value: 'server', type: 'string' },
    'next.route': { value: '/parameterized/[one]/beep/[two]', type: 'string' },
  });

  // No child span should share the segment span's name
  expect(spans.filter(span => !span.is_segment && span.name === segmentSpan.name)).toHaveLength(0);
});

test('Will create spans for every server component and metadata generation functions when visiting a page', async ({
  page,
}) => {
  const spanNamesPromise = collectSpanNamesUntilSegment('nextjs-16', 'GET /nested-layout');

  await page.goto('/nested-layout');

  const spanNames = await spanNamesPromise;

  expect(spanNames).toContainEqual('render route (app) /nested-layout');
  expect(spanNames).toContainEqual('build component tree');
  expect(spanNames).toContainEqual('resolve root layout server component');
  expect(spanNames).toContainEqual('resolve layout server component "(nested-layout)"');
  expect(spanNames).toContainEqual('resolve layout server component "nested-layout"');
  expect(spanNames).toContainEqual('resolve page server component "/nested-layout"');
  expect(spanNames).toContainEqual('generateMetadata /(nested-layout)/nested-layout/page');
  expect(spanNames).toContainEqual('start response');
});

test('Will create spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  test.skip(isTurbopackDevMode, 'Turbopack intermittently returns 404 for dynamic routes in dev mode');

  const spanNamesPromise = collectSpanNamesUntilSegment('nextjs-16', 'GET /nested-layout/[dynamic]');

  await page.goto('/nested-layout/123');

  const spanNames = await spanNamesPromise;

  expect(spanNames).toContainEqual('resolve page components');
  expect(spanNames).toContainEqual('render route (app) /nested-layout/[dynamic]');
  expect(spanNames).toContainEqual('build component tree');
  expect(spanNames).toContainEqual('resolve root layout server component');
  expect(spanNames).toContainEqual('resolve layout server component "(nested-layout)"');
  expect(spanNames).toContainEqual('resolve layout server component "nested-layout"');
  expect(spanNames).toContainEqual('resolve layout server component "[dynamic]"');
  expect(spanNames).toContainEqual('resolve page server component "/nested-layout/[dynamic]"');
  expect(spanNames).toContainEqual('generateMetadata /(nested-layout)/nested-layout/[dynamic]/page');
  expect(spanNames).toContainEqual('start response');
});
