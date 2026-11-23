import { expect, test } from '@playwright/test';
import { getSpanOp } from '@sentry-internal/test-utils';
import { setTestUser, endedByIdleTimeout, waitForStreamedSpan } from './helpers';

test.beforeEach(setTestUser);

test('Creates navigation span when navigating with query parameters from home to route', async ({ page }) => {
  await page.goto('/');

  // Navigate from / to /delayed-lazy/123?source=homepage
  // This should create a navigation transaction with the parameterized route name
  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/delayed-lazy/:id';
  });

  const navigationLink = page.locator('id=navigation-to-delayed-lazy-with-query');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const navigationEvent = await navigationPromise;

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();
  await expect(page.locator('id=delayed-lazy-id')).toHaveText('ID: 123');
  await expect(page.locator('id=delayed-lazy-path')).toHaveText('/delayed-lazy/123');
  await expect(page.locator('id=delayed-lazy-search')).toHaveText('?source=homepage');
  await expect(page.locator('id=delayed-lazy-source')).toHaveText('Source: homepage');

  // Verify the navigation transaction has the correct parameterized route name
  // Query parameters don't affect the transaction name (still /delayed-lazy/:id)
  expect(navigationEvent.name).toBe('/delayed-lazy/:id');
  expect(getSpanOp(navigationEvent)).toBe('navigation');
  expect(navigationEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(navigationEvent.status).toBe('ok');
});

test('Creates separate navigation spans for multiple query parameter changes', async ({ page }) => {
  await page.goto('/delayed-lazy/123');

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();

  // First query change: /delayed-lazy/123 -> /delayed-lazy/123?view=detailed
  const firstNavigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/delayed-lazy/:id';
  });

  const firstQueryLink = page.locator('id=link-to-query-view-detailed');
  await expect(firstQueryLink).toBeVisible();
  await firstQueryLink.click();

  const firstNavigationEvent = await firstNavigationPromise;
  const firstTraceId = firstNavigationEvent.trace_id;

  await expect(page.locator('id=delayed-lazy-search')).toHaveText('?view=detailed');
  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: detailed');
  expect(firstNavigationEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(firstNavigationEvent.status).toBe('ok');

  // Second query change: /delayed-lazy/123?view=detailed -> /delayed-lazy/123?view=list
  const secondNavigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'navigation' &&
      span.name === '/delayed-lazy/:id' &&
      span.trace_id !== firstTraceId
    );
  });

  const secondQueryLink = page.locator('id=link-to-query-view-list');
  await expect(secondQueryLink).toBeVisible();
  await secondQueryLink.click();

  const secondNavigationEvent = await secondNavigationPromise;
  const secondTraceId = secondNavigationEvent.trace_id;

  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: list');

  // Both navigations should have created separate transactions
  expect(firstNavigationEvent.name).toBe('/delayed-lazy/:id');
  expect(getSpanOp(firstNavigationEvent)).toBe('navigation');
  expect(secondNavigationEvent.name).toBe('/delayed-lazy/:id');
  expect(getSpanOp(secondNavigationEvent)).toBe('navigation');

  // Trace IDs should be different (separate transactions)
  expect(firstTraceId).toBeDefined();
  expect(secondTraceId).toBeDefined();
  expect(firstTraceId).not.toBe(secondTraceId);
});

test('Creates separate navigation spans for multiple hash changes', async ({ page }) => {
  await page.goto('/delayed-lazy/123');

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();

  // First hash change: /delayed-lazy/123 -> /delayed-lazy/123#section1
  const firstNavigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/delayed-lazy/:id';
  });

  const firstHashLink = page.locator('id=link-to-hash-section1');
  await expect(firstHashLink).toBeVisible();
  await firstHashLink.click();

  const firstNavigationEvent = await firstNavigationPromise;
  const firstTraceId = firstNavigationEvent.trace_id;

  await expect(page.locator('id=delayed-lazy-hash')).toHaveText('#section1');
  expect(firstNavigationEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(firstNavigationEvent.status).toBe('ok');

  // Second hash change: /delayed-lazy/123#section1 -> /delayed-lazy/123#section2
  const secondNavigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'navigation' &&
      span.name === '/delayed-lazy/:id' &&
      span.trace_id !== firstTraceId
    );
  });

  const secondHashLink = page.locator('id=link-to-hash-section2');
  await expect(secondHashLink).toBeVisible();
  await secondHashLink.click();

  const secondNavigationEvent = await secondNavigationPromise;
  const secondTraceId = secondNavigationEvent.trace_id;

  await expect(page.locator('id=delayed-lazy-hash')).toHaveText('#section2');

  // Both navigations should have created separate transactions
  expect(firstNavigationEvent.name).toBe('/delayed-lazy/:id');
  expect(getSpanOp(firstNavigationEvent)).toBe('navigation');
  expect(secondNavigationEvent.name).toBe('/delayed-lazy/:id');
  expect(getSpanOp(secondNavigationEvent)).toBe('navigation');

  // Trace IDs should be different (separate transactions)
  expect(firstTraceId).toBeDefined();
  expect(secondTraceId).toBeDefined();
  expect(firstTraceId).not.toBe(secondTraceId);
});

test('Creates navigation span when changing both query and hash on same route', async ({ page }) => {
  await page.goto('/delayed-lazy/123?view=list');

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();
  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: list');

  // Navigate from /delayed-lazy/123?view=list to /delayed-lazy/123?view=grid#results
  // This changes both query and hash
  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/delayed-lazy/:id';
  });

  const queryAndHashLink = page.locator('id=link-to-query-and-hash');
  await expect(queryAndHashLink).toBeVisible();
  await queryAndHashLink.click();

  const navigationEvent = await navigationPromise;

  // Verify both query and hash were updated
  await expect(page.locator('id=delayed-lazy-search')).toHaveText('?view=grid');
  await expect(page.locator('id=delayed-lazy-hash')).toHaveText('#results');
  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: grid');

  // Combined query + hash navigation should create a navigation transaction
  expect(navigationEvent.name).toBe('/delayed-lazy/:id');
  expect(getSpanOp(navigationEvent)).toBe('navigation');
  expect(navigationEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(navigationEvent.status).toBe('ok');
});

test('Query/hash navigation does not corrupt span name', async ({ page }) => {
  const navigationTransactions: Array<{ name: string }> = [];

  const collectorPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (span.is_segment && getSpanOp(span) === 'navigation') {
      navigationTransactions.push({ name: span.name });
    }
    return span.is_segment && getSpanOp(span) === 'navigation' && endedByIdleTimeout(span);
  });

  await page.goto('/');

  // Navigate to delayed-lazy route
  const delayedLazyLink = page.locator('id=navigation-to-delayed-lazy');
  await expect(delayedLazyLink).toBeVisible();
  await delayedLazyLink.click();
  await expect(page.locator('id=delayed-lazy-ready')).toBeVisible({ timeout: 10000 });

  // Trigger query-only navigation
  const queryLink = page.locator('id=link-to-query-view-detailed');
  await expect(queryLink).toBeVisible();
  await queryLink.click();
  await page.waitForURL('**/delayed-lazy/**?view=detailed');

  // Trigger hash-only navigation
  const hashLink = page.locator('id=link-to-hash-section1');
  await expect(hashLink).toBeVisible();
  await hashLink.click();
  await expect(page).toHaveURL(/#section1$/);

  // Trigger combined query+hash navigation
  const combinedLink = page.locator('id=link-to-query-and-hash');
  await expect(combinedLink).toBeVisible();
  await combinedLink.click();
  await expect(page).toHaveURL(/\?view=grid#results$/);

  await collectorPromise;

  expect(navigationTransactions.length).toBeGreaterThanOrEqual(1);
  expect(navigationTransactions[0].name).toBe('/delayed-lazy/:id');

  // No "/" corruption from query/hash navigations
  const corruptedToRoot = navigationTransactions.filter(t => t.name === '/');
  expect(corruptedToRoot.length).toBe(0);
});
