import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/posts/456`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/posts/$postId');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.solid.tanstack_router', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'url.path.parameter.postId': { value: '456', type: 'string' },
    'url.template': { value: '/posts/$postId', type: 'string' },
    'url.path': { value: '/posts/456', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/456$/), type: 'string' },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/posts/$postId';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  await page.waitForTimeout(5000);
  await page.locator('#nav-link').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('/posts/$postId');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.solid.tanstack_router', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'url.path.parameter.postId': { value: '2', type: 'string' },
    'url.template': { value: '/posts/$postId', type: 'string' },
    'url.path': { value: '/posts/2', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/2$/), type: 'string' },
  });
});

test('sends a pageload span named after the resolved route when a redirect is thrown on initial load', async ({
  page,
}) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/posts/$postId';
  });

  await page.goto(`/redirect`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/posts/$postId');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.solid.tanstack_router', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'url.path.parameter.postId': { value: '1', type: 'string' },
    'url.template': { value: '/posts/$postId', type: 'string' },
    'url.path': { value: '/posts/1', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/1$/), type: 'string' },
  });
});

test('sends a navigation span when a redirect is thrown in beforeLoad', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/posts/$postId';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  await page.locator('#redirect-link').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('/posts/$postId');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.solid.tanstack_router', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'url.path.parameter.postId': { value: '1', type: 'string' },
    'url.template': { value: '/posts/$postId', type: 'string' },
    'url.path': { value: '/posts/1', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/1$/), type: 'string' },
  });
});

test('sends a navigation span for a normal navigation that happens after a redirect', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  const redirectSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/posts/$postId';
  });
  await page.locator('#redirect-link').click();
  await redirectSpanPromise;

  const navigationSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return (
      getSpanOp(span) === 'navigation' && span.is_segment && span.attributes['url.path.parameter.postId']?.value === '2'
    );
  });

  await page.locator('#nav-link').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('/posts/$postId');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.solid.tanstack_router', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'url.path.parameter.postId': { value: '2', type: 'string' },
    'url.template': { value: '/posts/$postId', type: 'string' },
    'url.path': { value: '/posts/2', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/2$/), type: 'string' },
  });
});

test('sends a pageload span with web vital attributes and a standalone LCP span', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const lcpSpanPromise = waitForStreamedSpan('solid-tanstack-router', span => {
    return getSpanOp(span) === 'ui.webvital.lcp';
  });

  await page.goto(`/`);

  const pageloadSpan = await pageloadSpanPromise;

  // LCP is only reported once the page is hidden or a navigation happens
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const lcpSpan = await lcpSpanPromise;

  const webVitalNumber = { value: expect.any(Number), type: expect.stringMatching(/^(integer|double)$/) };

  expect(pageloadSpan.name).toBe('/');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.solid.tanstack_router', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
    'browser.web_vital.ttfb.value': webVitalNumber,
    'browser.web_vital.fp.value': webVitalNumber,
    'browser.web_vital.fcp.value': webVitalNumber,
  });

  expect(lcpSpan.attributes).toMatchObject({
    'sentry.op': { value: 'ui.webvital.lcp', type: 'string' },
    'sentry.origin': { value: 'auto.http.browser.lcp', type: 'string' },
    'sentry.pageload.span_id': { value: pageloadSpan.span_id, type: 'string' },
    'browser.web_vital.lcp.value': webVitalNumber,
  });
});
