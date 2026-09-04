import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends a pageload span to Sentry', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('hydrogen-react-router-7', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/';
  });

  await page.goto('/');

  expect(await spanPromise).toBeDefined();
});

test('Sends a navigation span to Sentry', async ({ page }) => {
  // Wait for the initial pageload span first. This ensures the client SDK and router are fully
  // hydrated before we click the link. Clicking before hydration completes makes the `<Link>` behave
  // like a plain anchor, triggering a full page navigation (a `pageload` span) instead of a
  // client-side `navigation` one, which makes this test flaky.
  const pageloadSpanPromise = waitForStreamedSpan('hydrogen-react-router-7', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/';
  });

  const spanPromise = waitForStreamedSpan('hydrogen-react-router-7', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/user/:id';
  });

  await page.goto('/');

  await pageloadSpanPromise;

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const span = await spanPromise;

  expect(span.name).toBe('/user/:id');
});

test('Renders `sentry-trace` and `baggage` meta tags for the root route', async ({ page }) => {
  await page.goto('/');

  const sentryTraceMetaTag = await page.waitForSelector('meta[name="sentry-trace"]', {
    state: 'attached',
  });
  const baggageMetaTag = await page.waitForSelector('meta[name="baggage"]', {
    state: 'attached',
  });

  expect(sentryTraceMetaTag).toBeTruthy();
  expect(baggageMetaTag).toBeTruthy();
});

test('Renders `sentry-trace` and `baggage` meta tags for a sub-route', async ({ page }) => {
  await page.goto('/user/123');

  const sentryTraceMetaTag = await page.waitForSelector('meta[name="sentry-trace"]', {
    state: 'attached',
  });
  const baggageMetaTag = await page.waitForSelector('meta[name="baggage"]', {
    state: 'attached',
  });

  expect(sentryTraceMetaTag).toBeTruthy();
  expect(baggageMetaTag).toBeTruthy();
});
