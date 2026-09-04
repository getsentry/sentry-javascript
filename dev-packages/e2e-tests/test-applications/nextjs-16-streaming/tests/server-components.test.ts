import { expect, test } from '@playwright/test';
import { collectSpanNamesUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

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

  const spanNamesPromise = collectSpanNamesUntilSegment('nextjs-16-streaming', 'GET /nested-layout');

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

test('Will create streamed spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  test.skip(isDevMode, 'Turbopack intermittently returns 404 for nested dynamic routes in dev mode');

  const spanNamesPromise = collectSpanNamesUntilSegment('nextjs-16-streaming', 'GET /nested-layout/[dynamic]');

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
