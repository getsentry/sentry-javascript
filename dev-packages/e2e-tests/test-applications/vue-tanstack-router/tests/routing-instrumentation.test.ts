import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`/posts/456`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.vue.tanstack_router' },
      'sentry.op': { type: 'string', value: 'pageload' },
      'url.path.parameter.postId': { type: 'string', value: '456' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/456' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/456$/) },
    },
  });
});

test('sends a pageload span for the root route', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`/`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: '/',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'pageload' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.vue.tanstack_router' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/' },
      'url.path': { type: 'string', value: '/' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/) },
    },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'navigation' && span.name === '/posts/$postId';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  await page.waitForTimeout(5000);

  await page.locator('#nav-link').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.vue.tanstack_router' },
      'sentry.op': { type: 'string', value: 'navigation' },
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
  const pageloadSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload' && span.name === '/posts/$postId';
  });

  await page.goto(`/redirect`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.vue.tanstack_router' },
      'sentry.op': { type: 'string', value: 'pageload' },
      'url.path.parameter.postId': { type: 'string', value: '1' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/1' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/1$/) },
    },
  });
});

test('sends a navigation span when a redirect is thrown in beforeLoad', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'navigation' && span.name === '/posts/$postId';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  await page.locator('#redirect-link').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan).toMatchObject({
    name: '/posts/$postId',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.vue.tanstack_router' },
      'sentry.op': { type: 'string', value: 'navigation' },
      'url.path.parameter.postId': { type: 'string', value: '1' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/1' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/1$/) },
    },
  });
});

test('sends a navigation span for a normal navigation that happens after a redirect', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  const redirectSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
    return span.is_segment && getSpanOp(span) === 'navigation' && span.name === '/posts/$postId';
  });
  await page.locator('#redirect-link').click();
  await redirectSpanPromise;

  const navigationSpanPromise = waitForStreamedSpan('vue-tanstack-router', span => {
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
      'sentry.origin': { type: 'string', value: 'auto.navigation.vue.tanstack_router' },
      'sentry.op': { type: 'string', value: 'navigation' },
      'url.path.parameter.postId': { type: 'string', value: '2' },
      'url.template': { type: 'string', value: '/posts/$postId' },
      'url.path': { type: 'string', value: '/posts/2' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/2$/) },
    },
  });
});
