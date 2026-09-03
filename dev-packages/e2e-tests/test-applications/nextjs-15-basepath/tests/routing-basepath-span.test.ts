import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates a pageload span for basePath root route with prefix', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('nextjs-15-basepath', span => {
    return span.name === '/my-app' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/my-app');

  expect(await pageloadSpanPromise).toBeDefined();
});

test('Creates a dynamic pageload span for basePath dynamic route with prefix', async ({ page }) => {
  const randomRoute = String(Math.random());

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-15-basepath', span => {
    return span.name === '/my-app/dynamic/:parameter' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/my-app/dynamic/${randomRoute}`);

  expect(await pageloadSpanPromise).toBeDefined();
});

test('Creates a dynamic pageload span for basePath dynamic catch-all route with prefix', async ({ page }) => {
  const randomRoute = String(Math.random());

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-15-basepath', span => {
    return span.name === '/my-app/dynamic/:parameters*' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/my-app/dynamic/${randomRoute}/foo/bar/baz`);

  expect(await pageloadSpanPromise).toBeDefined();
});

test('Creates a navigation span for basePath router with prefix', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-15-basepath', span => {
    return (
      span.name === '/my-app/navigation/:param/router-push' &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.attributes['navigation.type']?.value === 'router.push'
    );
  });

  await page.goto('/my-app/navigation');
  await page.waitForTimeout(1000);
  await page.getByText('router.push()').click();

  const navigationSpan = await navigationSpanPromise;
  expect(navigationSpan).toBeDefined();

  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.full': {
      value: expect.stringMatching(/^https?:\/\/localhost:\d+\/my-app\/navigation\/42\/router-push$/),
      type: 'string',
    },
    'url.path': { value: '/my-app/navigation/42/router-push', type: 'string' },
    'url.template': { value: '/my-app/navigation/:param/router-push', type: 'string' },
  });
});

test('Creates a navigation span for basePath <Link> with prefix', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-15-basepath', span => {
    return (
      span.name === '/my-app/navigation/:param/link' &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.attributes['navigation.type']?.value === 'router.push'
    );
  });

  await page.goto('/my-app/navigation');
  await page.waitForTimeout(1000);
  await page.getByText('Normal Link').click();

  expect(await navigationSpanPromise).toBeDefined();
});
