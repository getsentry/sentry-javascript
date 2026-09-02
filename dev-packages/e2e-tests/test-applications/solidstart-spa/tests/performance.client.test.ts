import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('solidstart-spa', span => {
    return span.name === '/' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/');
  const pageloadSpan = await spanPromise;

  expect(getSpanOp(pageloadSpan)).toBe('pageload');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.pageload.browser', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
  });
});

test('sends a navigation span with parametrized route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('solidstart-spa', span => {
    return span.name === '/users/:id' && getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  await page.locator('#navLink').click();
  const navigationSpan = await spanPromise;

  expect(getSpanOp(navigationSpan)).toBe('navigation');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.navigation.solidstart.solidrouter', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/users/:id', type: 'string' },
    'url.path': { value: '/users/5', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/users\/5$/), type: 'string' },
  });
});

test('updates the span when using the back button', async ({ page }) => {
  // Solid Router sends a `-1` navigation when using the back button.
  // The sentry solidRouterBrowserTracingIntegration tries to update such
  // spans with the proper name once the `useLocation` hook triggers.
  const navigationSpanPromise = waitForStreamedSpan('solidstart-spa', span => {
    return span.name === '/users/:id' && getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/back-navigation`);
  await page.locator('#navLink').click();
  const navigationSpan = await navigationSpanPromise;

  expect(getSpanOp(navigationSpan)).toBe('navigation');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.navigation.solidstart.solidrouter', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/users/:id', type: 'string' },
    'url.path': { value: '/users/6', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/users\/6$/), type: 'string' },
  });

  const backNavigationSpanPromise = waitForStreamedSpan('solidstart-spa', span => {
    return span.name === '/back-navigation' && getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goBack();
  const backNavigationSpan = await backNavigationSpanPromise;

  expect(getSpanOp(backNavigationSpan)).toBe('navigation');
  expect(backNavigationSpan.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.navigation.solidstart.solidrouter', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/back-navigation', type: 'string' },
    'url.path': { value: '/back-navigation', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/back-navigation$/), type: 'string' },
  });
});
