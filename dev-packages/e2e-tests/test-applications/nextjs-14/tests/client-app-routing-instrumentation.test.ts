import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates a pageload span for app router routes', async ({ page }) => {
  const randomRoute = String(Math.random());

  const clientPageloadSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return span.name === `/server-component/parameter/:parameter` && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/server-component/parameter/${randomRoute}`);

  expect(await clientPageloadSpanPromise).toBeDefined();
});

test('Creates a navigation span for app router routes', async ({ page }) => {
  const randomRoute = String(Math.random());

  const clientPageloadSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return span.name === `/server-component/parameter/:parameter` && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/server-component/parameter/${randomRoute}`);
  await clientPageloadSpanPromise;
  await page.getByText('Page (/server-component/[parameter])').isVisible();

  const clientNavigationSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return span.name === '/server-component/parameter/:parameters*' && getSpanOp(span) === 'navigation';
  });

  const serverComponentSpanPromise = waitForStreamedSpan('nextjs-14', span => {
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
