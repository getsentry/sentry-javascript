import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span named after the matched route', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/user/5');

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/user/:id');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'url.template': { value: '/user/:id', type: 'string' },
    'url.path.parameter.id': { value: '5', type: 'string' },
    'url.path': { value: '/user/5', type: 'string' },
  });
});

test('sends a navigation span for a link click', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });
  const navigationSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/');
  await pageloadSpanPromise;
  await page.locator('#navLink').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('/user/:id');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.solid.solidrouter', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'url.template': { value: '/user/:id', type: 'string' },
    'url.path.parameter.id': { value: '5', type: 'string' },
    'url.path': { value: '/user/5', type: 'string' },
  });
});

test('sends a navigation span for a programmatic navigation', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });
  const navigationSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/user/5');
  await pageloadSpanPromise;
  await page.locator('#navigateBtn').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('/user/:id');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.navigation.solid.solidrouter', type: 'string' },
    'url.path.parameter.id': { value: '6', type: 'string' },
    'url.path': { value: '/user/6', type: 'string' },
  });
});
