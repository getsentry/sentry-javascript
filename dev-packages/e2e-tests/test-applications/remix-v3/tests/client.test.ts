import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'remix-v3';

test('sends a pageload span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, span => getSpanOp(span) === 'pageload' && span.is_segment === true);

  await page.goto('/');

  const span = await spanPromise;
  // Ordinary document load, so this span comes from the upstream integration and takes the low
  // cardinality streaming name.
  expect(span.name).toBe('Pageload');
  expect(span.attributes?.['sentry.origin']?.value).toBe('auto.pageload.browser');
});

test('sends a navigation span for a link the runtime intercepts', async ({ page }) => {
  await page.goto('/');

  // Selected by origin, not just op. `remix/ui` never touches History, so a span from the upstream
  // handler would mean this SDK did not produce it.
  const spanPromise = waitForStreamedSpan(
    APP_NAME,
    span =>
      getSpanOp(span) === 'navigation' && span.attributes?.['sentry.origin']?.value === 'auto.navigation.remix_v3',
  );

  await page.locator('#to-user').click();
  await expect(page.locator('#user')).toBeVisible();

  const span = await spanPromise;
  expect(span.is_segment).toBe(true);
  expect(span.name).toBe('Navigation');
});

test('captures a component render error the runtime never rethrows', async ({ page }) => {
  await page.goto('/');

  const errorPromise = waitForError(APP_NAME, event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Component render failed';
  });

  await page.locator('#component-error').click();

  const error = await errorPromise;
  expect(error.exception?.values?.[0]?.mechanism).toEqual({ handled: false, type: 'auto.ui.remix_v3' });
});
