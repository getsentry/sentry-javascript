import { expect, test } from '@playwright/test';
import {
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_PATH,
  URL_PATH_PARAMETER_KEY_BASE,
  URL_TEMPLATE,
} from '@sentry/conventions/attributes';
import { NAVIGATION, PAGELOAD } from '@sentry/conventions/op';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span named after the matched route', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  await page.goto('/user/5');

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/user/:id');
  expect(pageloadSpan.attributes).toMatchObject({
    [SENTRY_SEGMENT_NAME_SOURCE]: { value: 'route', type: 'string' },
    [SENTRY_OP]: { value: PAGELOAD, type: 'string' },
    [URL_TEMPLATE]: { value: '/user/:id', type: 'string' },
    [`${URL_PATH_PARAMETER_KEY_BASE}.id`]: { value: '5', type: 'string' },
    [URL_PATH]: { value: '/user/5', type: 'string' },
  });
});

test('sends a navigation span for a link click', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === PAGELOAD && span.is_segment;
  });
  const navigationSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === NAVIGATION && span.is_segment;
  });

  await page.goto('/');
  await pageloadSpanPromise;
  await page.locator('#navLink').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('/user/:id');
  expect(navigationSpan.attributes).toMatchObject({
    [SENTRY_SEGMENT_NAME_SOURCE]: { value: 'route', type: 'string' },
    [SENTRY_ORIGIN]: { value: 'auto.navigation.solid.solidrouter', type: 'string' },
    [SENTRY_OP]: { value: NAVIGATION, type: 'string' },
    [URL_TEMPLATE]: { value: '/user/:id', type: 'string' },
    [`${URL_PATH_PARAMETER_KEY_BASE}.id`]: { value: '5', type: 'string' },
    [URL_PATH]: { value: '/user/5', type: 'string' },
  });
});

test('sends a navigation span for a programmatic navigation', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === PAGELOAD && span.is_segment;
  });
  const navigationSpanPromise = waitForStreamedSpan('solid-2', span => {
    return getSpanOp(span) === NAVIGATION && span.is_segment;
  });

  await page.goto('/user/5');
  await pageloadSpanPromise;
  await page.locator('#navigateBtn').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('/user/:id');
  expect(navigationSpan.attributes).toMatchObject({
    [SENTRY_ORIGIN]: { value: 'auto.navigation.solid.solidrouter', type: 'string' },
    [`${URL_PATH_PARAMETER_KEY_BASE}.id`]: { value: '6', type: 'string' },
    [URL_PATH]: { value: '/user/6', type: 'string' },
  });
});
