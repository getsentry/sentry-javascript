import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, waitForStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('Sends a streamed span for a request to app router with URL', async ({ page }) => {
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
  const spansPromise = waitForStreamedSpans('nextjs-16-streaming', spans => {
    return spans.some(span => span.name === 'GET /nested-layout' && span.is_segment);
  });

  await page.goto('/nested-layout');

  const spans = await spansPromise;
  const spanNames = spans.map(span => span.name);

  expect(spanNames).toContainEqual('render route (app) /nested-layout');
  expect(spanNames).toContainEqual('build component tree');
  expect(spanNames).toContainEqual('resolve root layout server component');
  expect(spanNames).toContainEqual('resolve layout server component "(nested-layout)"');
  expect(spanNames).toContainEqual('resolve layout server component "nested-layout"');
  expect(spanNames).toContainEqual('resolve page server component "/nested-layout"');
  expect(spanNames).toContainEqual('generateMetadata /(nested-layout)/nested-layout/page');
  expect(spanNames).toContainEqual('start response');
  expect(spanNames).toContainEqual('NextNodeServer.clientComponentLoading');
});

test('Will create streamed spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  const spansPromise = waitForStreamedSpans('nextjs-16-streaming', spans => {
    return spans.some(span => span.name === 'GET /nested-layout/[dynamic]' && span.is_segment);
  });

  await page.goto('/nested-layout/123');

  const spans = await spansPromise;
  const spanNames = spans.map(span => span.name);

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
  expect(spanNames).toContainEqual('NextNodeServer.clientComponentLoading');
});
