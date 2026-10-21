import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const BASE = process.env.E2E_TEST_BASEPATH || '';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const spansPromise = collectStreamedSpans('tanstack-router', spans => {
    return (
      spans.some(span => span.is_segment && getSpanOp(span) === 'pageload' && span.name === '/posts/$postId') &&
      spans.some(span => span.name === 'loading-post-456')
    );
  });

  await page.goto(`${BASE}/posts/456`);

  const spans = await spansPromise;
  const pageloadSpan = spans.find(
    span => span.is_segment && getSpanOp(span) === 'pageload' && span.name === '/posts/$postId',
  );

  expect(pageloadSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.react.tanstack_router' },
      'sentry.op': { type: 'string', value: 'pageload' },
      'url.path.parameter.postId': { type: 'string', value: '456' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/456' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/456$/) },
    },
  });

  expect(spans.map(span => span.name)).toContain('loading-post-456');
});

test('sends a pageload span for the root route', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`${BASE}/`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: '/',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'pageload' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.react.tanstack_router' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/' },
      'url.path': { type: 'string', value: '/' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/) },
    },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const spansPromise = collectStreamedSpans('tanstack-router', spans => {
    return (
      spans.some(span => span.is_segment && getSpanOp(span) === 'navigation' && span.name === '/posts/$postId') &&
      spans.some(span => span.name === 'loading-post-2')
    );
  });

  await page.goto(`${BASE}/`);
  await pageloadSpanPromise;

  await page.waitForTimeout(5000);
  await page.locator('#nav-link').click();

  const spans = await spansPromise;
  const navigationSpan = spans.find(
    span => span.is_segment && getSpanOp(span) === 'navigation' && span.name === '/posts/$postId',
  );

  expect(navigationSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.react.tanstack_router' },
      'sentry.op': { type: 'string', value: 'navigation' },
      'url.path.parameter.postId': { type: 'string', value: '2' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/2' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/2$/) },
    },
  });

  expect(spans.map(span => span.name)).toContain('loading-post-2');
});

test('sends a pageload span with resolved URL attrs after same-route redirect on initial load', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload' && span.name === '/posts/$postId';
  });

  // `/posts/999` matches `/posts/$postId` initially, then `beforeLoad` redirects to `/posts/2`.
  await page.goto(`${BASE}/posts/999`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.react.tanstack_router' },
      'sentry.op': { type: 'string', value: 'pageload' },
      'url.path.parameter.postId': { type: 'string', value: '2' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/2' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/2$/) },
    },
  });
});

test('sends a pageload span named after the resolved route when a redirect is thrown on initial load', async ({
  page,
}) => {
  const pageloadSpanPromise = waitForStreamedSpan('tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload' && span.name === '/posts/$postId';
  });

  // Visiting `/redirect` directly throws `redirect({ to: '/posts/$postId', params: { postId: '1' } })`
  // in `beforeLoad` during the initial pageload, so the pageload span must be renamed to the target route.
  await page.goto(`${BASE}/redirect`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.react.tanstack_router' },
      'sentry.op': { type: 'string', value: 'pageload' },
      'url.path.parameter.postId': { type: 'string', value: '1' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/1' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/1$/) },
    },
  });
});

test('sends a navigation span when a redirect is thrown in beforeLoad', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'navigation';
  });

  await page.goto(`${BASE}/`);
  await pageloadSpanPromise;

  await page.locator('#redirect-link').click();

  const navigationSpan = await navigationSpanPromise;

  // The `/redirect` route throws `redirect({ to: '/posts/$postId', params: { postId: '1' } })` in
  // `beforeLoad`, so the navigation span must be named after the resolved target route, not `/redirect`.
  expect(navigationSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.react.tanstack_router' },
      'sentry.op': { type: 'string', value: 'navigation' },
      'url.path.parameter.postId': { type: 'string', value: '1' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/1' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/1$/) },
    },
  });
});

test('sends a navigation span for a normal navigation that happens after a redirect', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`${BASE}/`);
  await pageloadSpanPromise;

  // First trigger a redirect-driven navigation. Upstream (TanStack/router#3920) this leaves the
  // router in a state where `onBeforeNavigate` never fires again, which previously killed all
  // subsequent navigation spans.
  const redirectSpanPromise = waitForStreamedSpan('tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'navigation' && span.name === '/posts/$postId';
  });
  await page.locator('#redirect-link').click();
  await redirectSpanPromise;

  // Now a plain navigation must still produce a navigation span.
  const navigationSpanPromise = waitForStreamedSpan('tanstack-router', span => {
    return (
      span.is_segment && getSpanOp(span) === 'navigation' && span.attributes['url.path.parameter.postId']?.value === '2'
    );
  });

  await page.locator('#nav-link').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.react.tanstack_router' },
      'sentry.op': { type: 'string', value: 'navigation' },
      'url.path.parameter.postId': { type: 'string', value: '2' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/2' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/2$/) },
    },
  });
});
