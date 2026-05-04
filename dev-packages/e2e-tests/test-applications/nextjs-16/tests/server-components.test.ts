import { expect, test } from '@playwright/test';
import { waitForRootSpan } from '@sentry-internal/test-utils';

test('Sends a transaction for a request to app router with URL', async ({ page }) => {
  const serverRootSpanPromise = waitForRootSpan('nextjs-16', rootSpan => {
    return rootSpan.name === 'GET /parameterized/[one]/beep/[two]';
  });

  await page.goto('/parameterized/1337/beep/42');

  const rootSpan = await serverRootSpanPromise;

  expect(rootSpan.op).toBe('http.server');
  expect(rootSpan.status).toBe('ok');
  expect(rootSpan.attributes).toEqual(
    expect.objectContaining({
      'sentry.op': 'http.server',
      'sentry.origin': 'auto',
      'sentry.source': 'route',
      'http.method': 'GET',
      'http.route': '/parameterized/[one]/beep/[two]',
      'next.route': '/parameterized/[one]/beep/[two]',
    }),
  );

  // The root span should not contain any child spans with the same name as the root span
  expect(rootSpan.childSpans.filter(span => span.name === rootSpan.name)).toHaveLength(0);
});

test('Will create a transaction with spans for every server component and metadata generation functions when visiting a page', async ({
  page,
}) => {
  const serverRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'GET /nested-layout';
  });

  await page.goto('/nested-layout');

  const spanNames = (await serverRootSpanPromise).childSpans.map(span => span.name);

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

test('Will create a transaction with spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  const serverRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'GET /nested-layout/[dynamic]';
  });

  await page.goto('/nested-layout/123');

  const spanNames = (await serverRootSpanPromise).childSpans.map(span => span.name);

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
