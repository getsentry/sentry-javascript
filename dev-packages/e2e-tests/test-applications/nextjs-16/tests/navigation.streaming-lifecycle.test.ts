import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';

function waitForNavigationSpan(name: string, navigationType: string) {
  return waitForStreamedSpan('nextjs-16', span => {
    return (
      span.name === name &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.attributes['navigation.type']?.value === navigationType
    );
  });
}

test('Creates a navigation span in the trace of the server request it triggers', async ({ page }) => {
  await page.goto('/navigation');

  const isNavigationSpan = (span: SerializedStreamedSpan) =>
    span.name === '/navigation/:param/link' && getSpanOp(span) === 'navigation' && !!span.is_segment;
  const isServerSpan = (span: SerializedStreamedSpan) =>
    span.name === 'GET /navigation/[param]/link' && !!span.is_segment;

  const spansPromise = collectStreamedSpans(
    'nextjs-16',
    spans => spans.some(isNavigationSpan) && spans.some(isServerSpan),
  );

  await page.getByText('Normal Link').click();

  const spans = await spansPromise;
  const navigationSpan = spans.find(isNavigationSpan)!;
  const serverSpan = spans.find(isServerSpan)!;

  expect(serverSpan.trace_id).toBe(navigationSpan.trace_id);
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'navigation.type': { value: 'router.push', type: 'string' },
    'url.template': { value: '/navigation/:param/link', type: 'string' },
    'url.path': { value: '/navigation/42/link', type: 'string' },
  });
});

test('Creates a navigation span for `router.push()`', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-push', 'router.push');

  await page.goto('/navigation');
  await page.getByText('router.push()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `router.replace()`', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-replace', 'router.replace');

  await page.goto('/navigation');
  await page.getByText('router.replace()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `router.back()`', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-back', 'router.traverse');

  await page.goto('/navigation/1337/router-back');
  await page.getByText('Go back home').click();
  await page.waitForURL('**/navigation');
  await page.getByText('router.back()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `router.forward()`', async ({ page }) => {
  await page.goto('/navigation');
  await page.getByText('router.push()').click();
  await page.waitForURL('**/navigation/42/router-push');
  await page.goBack();
  await page.waitForURL('**/navigation');

  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-push', 'router.traverse');

  await page.getByText('router.forward()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `<Link />`', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/link', 'router.push');

  await page.goto('/navigation');
  await page.getByText('Normal Link').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `<Link replace />`', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/link-replace', 'router.replace');

  await page.goto('/navigation');
  await page.getByText('Link Replace').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for browser-back', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/browser-back', 'router.traverse');

  await page.goto('/navigation/42/browser-back');
  await page.getByText('Go back home').click();
  await page.waitForURL('**/navigation');
  await page.goBack();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for browser-forward', async ({ page }) => {
  await page.goto('/navigation');
  await page.getByText('router.push()').click();
  await page.waitForURL('**/navigation/42/router-push');
  await page.goBack();
  await page.waitForURL('**/navigation');

  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-push', 'router.traverse');

  await page.goForward();

  expect(await navigationSpanPromise).toBeDefined();
});
