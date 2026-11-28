import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { waitForNavigationSpan } from './navigation-helpers';

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
  await page.waitForURL('**/navigation', { waitUntil: 'commit' });
  await expect(page.getByText('router.push()', { exact: true })).toBeEnabled();
  await page.goBack({ waitUntil: 'commit' });

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for browser-forward', async ({ page }) => {
  await page.goto('/navigation');
  await page.getByText('router.push()').click();
  await page.waitForURL('**/navigation/42/router-push', { waitUntil: 'commit' });
  await expect(page.getByText('hello world', { exact: true })).toBeVisible();
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForURL('**/navigation', { waitUntil: 'commit' });
  await expect(page.getByText('router.push()', { exact: true })).toBeEnabled();

  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-push', 'router.traverse');

  await page.goForward({ waitUntil: 'commit' });

  expect(await navigationSpanPromise).toBeDefined();
});
