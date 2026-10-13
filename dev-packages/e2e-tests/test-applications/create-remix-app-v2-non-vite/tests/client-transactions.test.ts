import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends a pageload span to Sentry', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-v2-non-vite', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === 'routes/_index';
  });

  await page.goto('/');

  const span = await spanPromise;

  expect(span.attributes).toMatchObject({
    // No manifest available (legacy app without the Sentry Vite plugin), so source falls back to 'route'
    // and url.template uses the route id instead of a parameterized URL path.
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.template': { value: 'routes/_index', type: 'string' },
  });
});

test('Sends a navigation span to Sentry', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-v2-non-vite', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === 'routes/user.$id';
  });

  await page.goto('/');

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const span = await spanPromise;

  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/user\/5$/), type: 'string' },
    'url.path': { value: '/user/5', type: 'string' },
    'url.template': { value: 'routes/user.$id', type: 'string' },
  });
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
