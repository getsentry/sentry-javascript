import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';

// Streamed spans are flushed across multiple envelopes as they end, so the server-component child spans
// can arrive in a different (earlier) envelope than the `is_segment` root span. Accumulate spans across
// envelopes until the root span (which ends last) is seen.
function collectSpanNamesUntilSegment(segmentName: string): Promise<string[]> {
  return collectStreamedSpans('nextjs-app-dir', spans =>
    spans.some(span => span.name === segmentName && span.is_segment),
  ).then(spans => spans.map(span => span.name));
}

test('Will create spans for every server component and metadata generation functions when visiting a page', async ({
  page,
}) => {
  const spanNamesPromise = collectSpanNamesUntilSegment('GET /nested-layout');

  await page.goto('/nested-layout');

  const spanNames = await spanNamesPromise;

  expect(spanNames).toContainEqual('render route (app) /nested-layout');
  expect(spanNames).toContainEqual('generateMetadata /(nested-layout)/nested-layout/page');

  expect(spanNames).toContainEqual('resolve page components');
  expect(spanNames).toContainEqual('build component tree');
  expect(spanNames).toContainEqual('resolve root layout server component');
  expect(spanNames).toContainEqual('resolve layout server component "(nested-layout)"');
  expect(spanNames).toContainEqual('resolve layout server component "nested-layout"');
  expect(spanNames).toContainEqual('resolve page server component "/nested-layout"');
  expect(spanNames).toContainEqual('start response');
});

test('Will create spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  const spanNamesPromise = collectSpanNamesUntilSegment('GET /nested-layout/[dynamic]');

  await page.goto('/nested-layout/123');

  const spanNames = await spanNamesPromise;

  expect(spanNames).toContainEqual('render route (app) /nested-layout/[dynamic]');
  expect(spanNames).toContainEqual('generateMetadata /(nested-layout)/nested-layout/[dynamic]/page');

  expect(spanNames).toContainEqual('resolve page components');
  expect(spanNames).toContainEqual('build component tree');
  expect(spanNames).toContainEqual('resolve root layout server component');
  expect(spanNames).toContainEqual('resolve layout server component "(nested-layout)"');
  expect(spanNames).toContainEqual('resolve layout server component "nested-layout"');
  expect(spanNames).toContainEqual('resolve layout server component "[dynamic]"');
  expect(spanNames).toContainEqual('resolve page server component "/nested-layout/[dynamic]"');
  expect(spanNames).toContainEqual('start response');
});
