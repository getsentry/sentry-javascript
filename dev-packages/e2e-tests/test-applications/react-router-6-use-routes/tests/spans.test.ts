import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-6-use-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/`);

  const span = await spanPromise;

  expect(span.name).toBe('/');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  const pageloadSpanPromise = waitForStreamedSpan('react-router-6-use-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-router-6-use-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  const linkElement = page.locator('id=navigation');

  const [_, navigationSpan] = await Promise.all([linkElement.click(), navigationSpanPromise]);

  expect(navigationSpan.name).toBe('/user/:id');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/user/:id', type: 'string' },
    'url.path': { value: '/user/5', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/user\/5$/), type: 'string' },
  });
});
