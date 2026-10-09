import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'remix-v3';

test('sends a pageload span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, span => getSpanOp(span) === 'pageload' && span.is_segment === true);

  await page.goto('/');

  const span = await spanPromise;
  // Started by the upstream integration, then named after the route the server reported.
  expect(span.name).toBe('/');
  expect(span.attributes?.['sentry.origin']?.value).toBe('auto.pageload.browser');
  expect(span.attributes?.['sentry.segment.name.source']?.value).toBe('route');
});

test('continues the server trace on a page load', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan(
    APP_NAME,
    span =>
      getSpanOp(span) === 'http.server' && span.is_segment === true && span.attributes?.['http.route']?.value === '/',
  );
  const pageloadPromise = waitForStreamedSpan(
    APP_NAME,
    span => getSpanOp(span) === 'pageload' && span.is_segment === true,
  );

  await page.goto('/');

  const [serverSpan, pageload] = await Promise.all([serverSpanPromise, pageloadPromise]);
  // The document's response carried the trace in `Server-Timing`, which the browser SDK picks up.
  expect(pageload.trace_id).toBe(serverSpan.trace_id);
  expect(pageload.parent_span_id).toBe(serverSpan.span_id);
});

test('parameterizes a page load on a route with params', async ({ page }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, span => getSpanOp(span) === 'pageload' && span.is_segment === true);

  await page.goto('/users/12345');

  const span = await spanPromise;
  expect(span.name).toBe('/users/:id');
  expect(span.name).not.toContain('12345');
  expect(span.attributes?.['sentry.segment.name.source']?.value).toBe('route');
  expect(span.attributes?.['url.template']?.value).toBe('/users/:id');
});

test('sends a navigation span for a link the runtime intercepts', async ({ page }) => {
  await page.goto('/');

  // Selected by origin, not just op. `remix/component` never touches History, so a span from the upstream
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
  // The pattern, not the path: an id in the name would make every navigation its own transaction.
  expect(span.name).toBe('/users/:id');
  expect(span.name).not.toContain('12345');
  expect(span.attributes?.['sentry.segment.name.source']?.value).toBe('route');
});

test('names a navigation to a route it loaded before right at the start', async ({ page }) => {
  await page.goto('/');
  await page.locator('#to-user').click();
  await expect(page.locator('#user')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#to-user')).toBeVisible();

  // Named through the route provider before any response, so the span never carried the fallback name.
  // Matched on the destination path: the back navigation is a Remix navigation span too, and it can
  // be sent when this click starts.
  const spanPromise = waitForStreamedSpan(
    APP_NAME,
    span =>
      getSpanOp(span) === 'navigation' &&
      span.attributes?.['sentry.origin']?.value === 'auto.navigation.remix_v3' &&
      span.attributes?.['url.path']?.value === '/users/12345',
  );

  await page.locator('#to-user').click();
  await expect(page.locator('#user')).toBeVisible();

  const span = await spanPromise;
  expect(span.name).toBe('/users/:id');
  expect(span.attributes?.['url.template']?.value).toBe('/users/:id');
});

test('groups an error after a first visit navigation by the route, not the path', async ({ page }) => {
  await page.goto('/');
  await page.locator('#to-user').click();
  await expect(page.locator('#user')).toBeVisible();

  const errorPromise = waitForError(APP_NAME, event => event.exception?.values?.[0]?.value === 'Remix 3 client error');

  await page.locator('#throw-on-user').click();

  const error = await errorPromise;
  // The span started under the fallback name and was renamed later; the scope's transaction name
  // has to follow, otherwise the error would carry `/users/12345`.
  expect(error.transaction).toBe('/users/:id');
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
