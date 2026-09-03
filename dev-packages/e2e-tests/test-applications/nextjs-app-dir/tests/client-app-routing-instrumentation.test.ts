import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates a pageload span for app router routes', async ({ page }) => {
  const randomRoute = String(Math.random());

  const clientPageloadSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === `/server-component/parameter/:parameter` && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/server-component/parameter/${randomRoute}`);

  expect(await clientPageloadSpanPromise).toBeDefined();
});

test('Creates a navigation span for app router routes', async ({ page }) => {
  const randomRoute = String(Math.random());

  const clientPageloadSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === `/server-component/parameter/:parameter` && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/server-component/parameter/${randomRoute}`);
  await clientPageloadSpanPromise;
  await page.getByText('Page (/server-component/[parameter])').isVisible();

  const clientNavigationSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === '/server-component/parameter/:parameters*' && getSpanOp(span) === 'navigation';
  });

  const serverComponentSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return (
      // It seems to differ between Next.js versions whether the route is parameterized or not
      (span.name === 'GET /server-component/parameter/foo/bar/baz' ||
        span.name === 'GET /server-component/parameter/[...parameters]') &&
      span.is_segment &&
      String(span.attributes['http.target']?.value).startsWith('/server-component/parameter/foo/bar/baz')
    );
  });

  await page.getByText('/server-component/parameter/foo/bar/baz').click();

  const clientNavigationSpan = await clientNavigationSpanPromise;
  const serverComponentSpan = await serverComponentSpanPromise;

  expect(clientNavigationSpan).toBeDefined();
  expect(serverComponentSpan).toBeDefined();

  expect(serverComponentSpan.trace_id).toBe(clientNavigationSpan.trace_id);
});

test('Creates a navigation span for `router.push()`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return (
      span.name === `/navigation/:param/router-push` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'router.push'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('router.push()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `router.replace()`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return (
      span.name === `/navigation/:param/router-replace` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'router.replace'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('router.replace()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

// Skipped rather than relaxed to `browser.popstate`: under span streaming these navigations lose the
// back/forward distinction, which looks like a regression rather than intended behaviour.
// See https://github.com/getsentry/sentry-javascript/issues/23909
test.skip('Creates a navigation span for `router.back()`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === `/navigation/:param/router-back` && getSpanOp(span) === 'navigation';
  });

  await page.goto('/navigation/1337/router-back');
  await page.waitForTimeout(3000);
  await page.getByText('Go back home').click();
  await page.waitForTimeout(3000);
  await page.getByText('router.back()').click();

  const navigationSpan = await navigationSpanPromise;

  // back is Next.js < 15.3.0, traverse >= 15.3.0
  expect(navigationSpan.attributes['navigation.type']?.value).toMatch(/router\.(back|traverse)/);
});

// Skipped rather than relaxed to `browser.popstate`: under span streaming these navigations lose the
// back/forward distinction, which looks like a regression rather than intended behaviour.
// See https://github.com/getsentry/sentry-javascript/issues/23909
test.skip('Creates a navigation span for `router.forward()`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return (
      span.name === `/navigation/:param/router-push` &&
      getSpanOp(span) === 'navigation' &&
      (span.attributes['navigation.type']?.value === 'router.forward' ||
        span.attributes['navigation.type']?.value === 'router.traverse')
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('router.push()').click();
  await page.waitForTimeout(3000);
  await page.goBack();
  await page.waitForTimeout(3000);
  await page.getByText('router.forward()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `<Link />`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return (
      span.name === `/navigation/:param/link` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'router.push'
    );
  });

  await page.goto('/navigation');
  await page.getByText('Normal Link').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `<Link replace />`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return (
      span.name === `/navigation/:param/link-replace` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'router.replace'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('Link Replace').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for browser-back', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return (
      span.name === `/navigation/:param/browser-back` &&
      getSpanOp(span) === 'navigation' &&
      (span.attributes['navigation.type']?.value === 'browser.popstate' ||
        span.attributes['navigation.type']?.value === 'router.traverse')
    );
  });

  await page.goto('/navigation/42/browser-back');
  await page.waitForTimeout(3000);
  await page.getByText('Go back home').click();
  await page.waitForTimeout(3000);
  await page.goBack();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for browser-forward', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return (
      span.name === `/navigation/:param/router-push` &&
      getSpanOp(span) === 'navigation' &&
      (span.attributes['navigation.type']?.value === 'browser.popstate' ||
        span.attributes['navigation.type']?.value === 'router.traverse')
    );
  });

  await page.goto('/navigation');
  await page.getByText('router.push()').click();
  await page.waitForTimeout(3000);
  await page.goBack();
  await page.waitForTimeout(3000);
  await page.goForward();

  expect(await navigationSpanPromise).toBeDefined();
});
