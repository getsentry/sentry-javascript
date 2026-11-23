import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp } from '@sentry-internal/test-utils';
import {
  setTestUser,
  hasUrlPart,
  childSpansInTraceOf,
  collectUntilNavigationSegment,
  endedByIdleTimeout,
  collectStreamedSpansUntilSegment,
  waitForStreamedSpan,
} from './helpers';

test.beforeEach(setTestUser);

test('Creates separate spans for rapid consecutive navigations', async ({ page }) => {
  await page.goto('/');

  // Set up transaction listeners
  const firstTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  const secondTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/another-lazy/sub/:id/:subId';
  });

  // Third navigation promise - using counter to match second occurrence of same route
  let innerRouteMatchCount = 0;
  const thirdTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (
      span.is_segment &&
      getSpanOp(span) === 'navigation' &&
      span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    ) {
      innerRouteMatchCount++;
      return innerRouteMatchCount === 2; // Match the second occurrence
    }
    return false;
  });

  // Perform navigations
  // First navigation: / -> /lazy/inner/:id/:anotherId/:someAnotherId
  await page.locator('id=navigation').click();

  const firstEvent = await firstTransactionPromise;

  // Second navigation: /lazy/inner -> /another-lazy/sub/:id/:subId
  await page.locator('id=navigate-to-another-from-inner').click();

  const secondEvent = await secondTransactionPromise;

  // Third navigation: /another-lazy -> /lazy/inner/:id/:anotherId/:someAnotherId (back to same route as first)
  await page.locator('id=navigate-to-inner-from-deep').click();

  const thirdEvent = await thirdTransactionPromise;

  // Verify transactions
  expect(firstEvent.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(getSpanOp(firstEvent)).toBe('navigation');
  const firstTraceId = firstEvent.trace_id;
  const firstSpanId = firstEvent.span_id;

  expect(secondEvent.name).toBe('/another-lazy/sub/:id/:subId');
  expect(getSpanOp(secondEvent)).toBe('navigation');
  expect(secondEvent.status).toBe('ok');

  const secondTraceId = secondEvent.trace_id;
  const secondSpanId = secondEvent.span_id;

  // Verify third transaction
  expect(thirdEvent.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(getSpanOp(thirdEvent)).toBe('navigation');
  expect(thirdEvent.status).toBe('ok');

  const thirdTraceId = thirdEvent.trace_id;
  const thirdSpanId = thirdEvent.span_id;

  // Verify each navigation created a separate transaction with unique trace and span IDs
  expect(firstTraceId).toBeDefined();
  expect(secondTraceId).toBeDefined();
  expect(thirdTraceId).toBeDefined();

  // All trace IDs should be unique
  expect(firstTraceId).not.toBe(secondTraceId);
  expect(secondTraceId).not.toBe(thirdTraceId);
  expect(firstTraceId).not.toBe(thirdTraceId);

  // All span IDs should be unique
  expect(firstSpanId).not.toBe(secondSpanId);
  expect(secondSpanId).not.toBe(thirdSpanId);
  expect(firstSpanId).not.toBe(thirdSpanId);
});

test('Rapid navigation does not corrupt span names when lazy handlers resolve late', async ({ page }) => {
  await page.goto('/');

  const allTransactions: Array<{ name: string; op: string }> = [];

  const collectorPromise = collectUntilNavigationSegment('/another-lazy/sub', span => {
    if (span.is_segment && getSpanOp(span)) {
      allTransactions.push({
        name: span.name,
        op: getSpanOp(span) ?? '',
      });
    }
  });

  // Navigate to slow-fetch route (500ms delay)
  const slowFetchLink = page.locator('id=navigation-to-slow-fetch');
  await expect(slowFetchLink).toBeVisible();
  await slowFetchLink.click();

  // Navigate away before lazy handler resolves
  await page.waitForTimeout(200);
  const anotherLink = page.locator('id=navigation-to-another');
  await anotherLink.click();

  await expect(page.locator('id=another-lazy-route')).toBeVisible({ timeout: 10000 });
  await collectorPromise;

  const navigationTransactions = allTransactions.filter(t => t.op === 'navigation');

  expect(navigationTransactions.length).toBeGreaterThanOrEqual(1);

  // No "/" corruption
  const corruptedToRoot = navigationTransactions.filter(t => t.name === '/');
  expect(corruptedToRoot.length).toBe(0);

  // At least one valid route name
  const validRoutePatterns = [
    '/slow-fetch/:id',
    '/another-lazy/sub',
    '/another-lazy/sub/:id',
    '/another-lazy/sub/:id/:subId',
  ];
  const hasValidRouteName = navigationTransactions.some(t => validRoutePatterns.includes(t.name));
  expect(hasValidRouteName).toBe(true);
});

test('Correctly names pageload span for slow lazy route with fetch', async ({ page }) => {
  // This test verifies that a slow lazy route (with top-level await and fetch)
  // creates a correctly named pageload span

  const spansPromise = collectStreamedSpansUntilSegment('react-router-7-lazy-routes', '/slow-fetch/:id');

  await page.goto('/slow-fetch/123');

  const spans = await spansPromise;
  const pageloadSpan = spans.find(span => span.is_segment)!;

  // Wait for the component to render (after the 500ms delay)
  const slowFetchContent = page.locator('id=slow-fetch-content');
  await expect(slowFetchContent).toBeVisible({ timeout: 5000 });
  await expect(page.locator('id=slow-fetch-id')).toHaveText('ID: 123');

  // Verify the span has the correct parameterized route name
  expect(pageloadSpan.name).toBe('/slow-fetch/:id');
  expect(getSpanOp(pageloadSpan)).toBe('pageload');
  expect(pageloadSpan.attributes['sentry.segment.name.source']?.value).toBe('route');

  // Verify the trace contains a fetch span. Streamed http.client names are only `<METHOD> <domain>`,
  // so the request URL comes from `url.full`.
  const fetchSpan = spans.find(span => getSpanOp(span) === 'http.client' && hasUrlPart(span, '/api/slow-data'));

  // The fetch span should exist (even if the fetch failed, the span is created)
  expect(fetchSpan).toBeDefined();
});

test('Three-route rapid navigation preserves distinct span names', async ({ page }) => {
  const navigationTransactions: Array<{ name: string }> = [];

  const navigationCollector = collectUntilNavigationSegment('/another-lazy/sub', span => {
    if (getSpanOp(span) === 'navigation') {
      navigationTransactions.push({ name: span.name });
    }
  });

  const pageloadPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/delayed-lazy/:id';
  });

  // Pageload to delayed-lazy route
  await page.goto('/delayed-lazy/111');
  await pageloadPromise;
  await expect(page.locator('id=delayed-lazy-ready')).toBeVisible({ timeout: 5000 });

  // Navigate to slow-fetch (500ms delay)
  const slowFetchLink = page.locator('id=delayed-lazy-to-slow-fetch');
  await slowFetchLink.click();
  await page.waitForTimeout(150);

  // Navigate to another-lazy before slow-fetch resolves
  const anotherLazyLink = page.locator('id=delayed-lazy-to-another-lazy');
  await anotherLazyLink.click();

  await expect(page.locator('id=another-lazy-route')).toBeVisible({ timeout: 10000 });
  await navigationCollector;

  expect(navigationTransactions.length).toBe(2);

  // Distinct names (corruption causes both to have same name)
  const uniqueNames = new Set(navigationTransactions.map(t => t.name));
  expect(uniqueNames.size).toBe(2);

  // No "/" corruption
  const corruptedToRoot = navigationTransactions.filter(t => t.name === '/');
  expect(corruptedToRoot.length).toBe(0);
});

test('Zero-wait rapid navigation does not corrupt span names', async ({ page }) => {
  const navigationTransactions: Array<{ name: string }> = [];

  const collector = collectUntilNavigationSegment('/another-lazy/sub', span => {
    if (getSpanOp(span) === 'navigation') {
      navigationTransactions.push({ name: span.name });
    }
  });

  await page.goto('/');

  const slowFetchLink = page.locator('id=navigation-to-slow-fetch');
  const anotherLink = page.locator('id=navigation-to-another');
  await expect(slowFetchLink).toBeVisible();
  await expect(anotherLink).toBeVisible();

  // Click first then immediately second (no wait)
  await slowFetchLink.click();
  await anotherLink.click();

  await expect(page.locator('id=another-lazy-route')).toBeVisible({ timeout: 10000 });
  await collector;

  expect(navigationTransactions.length).toBeGreaterThanOrEqual(1);

  // No "/" corruption
  const corruptedToRoot = navigationTransactions.filter(t => t.name === '/');
  expect(corruptedToRoot.length).toBe(0);
});

test('Browser back during lazy handler resolution does not corrupt', async ({ page }) => {
  const allTransactions: Array<{ name: string; op: string }> = [];
  let wentBack = false;

  const collector = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (span.is_segment && getSpanOp(span)) {
      allTransactions.push({
        name: span.name,
        op: getSpanOp(span) ?? '',
      });
    }
    // The pageload of the page we went back to is the last span
    return wentBack && span.is_segment && getSpanOp(span) === 'pageload' && endedByIdleTimeout(span);
  });

  await page.goto('/');
  await expect(page.locator('id=navigation')).toBeVisible();

  // Navigate to another-lazy to establish history
  const anotherLink = page.locator('id=navigation-to-another');
  await anotherLink.click();
  await expect(page.locator('id=another-lazy-route')).toBeVisible({ timeout: 10000 });

  // Navigate to slow-fetch route
  await page.goto('/slow-fetch/123');
  await page.waitForTimeout(150);

  // Press browser back before handler resolves
  wentBack = true;
  await page.goBack();

  const backPageload = await collector;

  expect(allTransactions.length).toBeGreaterThanOrEqual(1);
  expect(allTransactions.every(t => t.name.length > 0)).toBe(true);
  expect(backPageload.name).toBe('/another-lazy/sub');
});

test('Multiple overlapping lazy handlers do not corrupt each other', async ({ page }) => {
  const navigationTransactions: Array<{ name: string }> = [];

  const collector = collectUntilNavigationSegment('/another-lazy/sub', span => {
    if (getSpanOp(span) === 'navigation') {
      navigationTransactions.push({ name: span.name });
    }
  });

  await page.goto('/');

  // Navigation 1: To delayed-lazy (400ms delay)
  const delayedLazyLink = page.locator('id=navigation-to-delayed-lazy');
  await expect(delayedLazyLink).toBeVisible();
  await delayedLazyLink.click();
  await page.waitForTimeout(50);

  // Navigation 2: To slow-fetch (500ms delay)
  const slowFetchLink = page.locator('id=navigation-to-slow-fetch');
  await slowFetchLink.click();
  await page.waitForTimeout(50);

  // Navigation 3: To another-lazy (fast)
  const anotherLink = page.locator('id=navigation-to-another');
  await anotherLink.click();

  await expect(page.locator('id=another-lazy-route')).toBeVisible({ timeout: 10000 });
  await collector;

  expect(navigationTransactions.length).toBeGreaterThanOrEqual(1);

  // No "/" corruption
  const corruptedToRoot = navigationTransactions.filter(t => t.name === '/');
  expect(corruptedToRoot.length).toBe(0);

  // If multiple navigations, they should have distinct names
  if (navigationTransactions.length >= 2) {
    const allSameName = navigationTransactions.every(t => t.name === navigationTransactions[0].name);
    expect(allSameName).toBe(false);
  }
});

test('Captured navigation context is used instead of stale window.location during rapid navigation', async ({
  page,
}) => {
  // Validates fix for race condition where captureCurrentLocation would use stale WINDOW.location.
  // Navigate to slow route, then quickly to another route before lazy handler resolves.
  await page.goto('/');

  const allNavigationTransactions: Array<{ name: string; traceId: string }> = [];

  const collectorPromise = collectUntilNavigationSegment('/another-lazy/sub', span => {
    if (span.is_segment && getSpanOp(span) === 'navigation') {
      allNavigationTransactions.push({
        name: span.name,
        traceId: span.trace_id || '',
      });
    }
  });

  const slowFetchLink = page.locator('id=navigation-to-slow-fetch');
  await expect(slowFetchLink).toBeVisible();
  await slowFetchLink.click();

  // Navigate away quickly before slow-fetch's async handler resolves
  await page.waitForTimeout(50);

  const anotherLink = page.locator('id=navigation-to-another');
  await anotherLink.click();

  await expect(page.locator('id=another-lazy-route')).toBeVisible({ timeout: 10000 });

  await collectorPromise;

  expect(allNavigationTransactions.length).toBeGreaterThanOrEqual(1);

  // /another-lazy transaction must have correct name (not corrupted by slow-fetch handler)
  const anotherLazyTransaction = allNavigationTransactions.find(t => t.name.startsWith('/another-lazy/sub'));
  expect(anotherLazyTransaction).toBeDefined();

  const corruptedToRoot = allNavigationTransactions.filter(t => t.name === '/');
  expect(corruptedToRoot.length).toBe(0);

  if (allNavigationTransactions.length >= 2) {
    const uniqueNames = new Set(allNavigationTransactions.map(t => t.name));
    expect(uniqueNames.size).toBe(allNavigationTransactions.length);
  }
});

test('Second navigation span is not corrupted by first slow lazy handler completing late', async ({ page }) => {
  // Validates fix for race condition where slow lazy handler would update the wrong span.
  // Navigate to slow route (which fetches /api/slow-data), then quickly to fast route.
  // Without fix: the second segment gets the wrong name and/or contains leaked spans.

  await page.goto('/');

  const streamedSpans: SerializedStreamedSpan[] = [];

  const collectorPromise = collectUntilNavigationSegment('/another-lazy/sub', span => {
    streamedSpans.push(span);
  });

  // Navigate to slow-fetch (500ms lazy delay, fetches /api/slow-data)
  const slowFetchLink = page.locator('id=navigation-to-slow-fetch');
  await expect(slowFetchLink).toBeVisible();
  await slowFetchLink.click();

  // Wait 150ms (before 500ms lazy loading completes), then navigate away
  await page.waitForTimeout(150);

  const anotherLink = page.locator('id=navigation-to-another');
  await anotherLink.click();

  await expect(page.locator('id=another-lazy-route')).toBeVisible({ timeout: 10000 });

  await collectorPromise;

  const navigationSegmentSpans = streamedSpans.filter(span => getSpanOp(span) === 'navigation' && span.is_segment);
  expect(navigationSegmentSpans.length).toBeGreaterThanOrEqual(1);

  // /another-lazy segment must have the correct name, not "/slow-fetch/:id"
  const anotherLazySegment = navigationSegmentSpans.find(span => span.name.startsWith('/another-lazy/sub'));
  expect(anotherLazySegment).toBeDefined();

  // Key assertion 2: the /another-lazy trace must NOT contain spans from the /slow-fetch route.
  // The /api/slow-data fetch is triggered by the slow-fetch route's lazy loading.
  if (anotherLazySegment) {
    const leakedSpans = childSpansInTraceOf(streamedSpans, anotherLazySegment).filter(span =>
      hasUrlPart(span, 'slow-data'),
    );
    expect(leakedSpans.length).toBe(0);
  }

  // Key assertion 3: If a slow-fetch segment exists, verify it has the correct name
  // (not corrupted to /another-lazy)
  const slowFetchSegment = navigationSegmentSpans.find(span => span.name.includes('slow-fetch'));
  if (slowFetchSegment) {
    expect(slowFetchSegment.name).toMatch(/\/slow-fetch/);
    // Verify the slow-fetch trace doesn't contain spans that belong to /another-lazy
    const wrongSpans = childSpansInTraceOf(streamedSpans, slowFetchSegment).filter(span =>
      hasUrlPart(span, 'another-lazy'),
    );
    expect(wrongSpans.length).toBe(0);
  }
});

test('Does not rename the previous navigation span with the route of the next navigation', async ({ page }) => {
  const navigationNames: string[] = [];

  const navigationsPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (getSpanOp(span) === 'navigation' && span.is_segment) {
      navigationNames.push(span.name);
    }

    return navigationNames.length >= 2;
  });

  await page.goto('/');

  const toAnotherLazy = page.locator('id=navigation-to-another-deep');
  await expect(toAnotherLazy).toBeVisible();
  await toAnotherLazy.click();

  // No wait in between: the second navigation has to start while the first navigation's span is
  // still open, which is when React Router hands it the second location's routes.
  const toInnerLazy = page.locator('id=navigate-to-inner-from-deep');
  await expect(toInnerLazy).toBeVisible();
  await toInnerLazy.click();

  await expect(page.locator('id=innermost-lazy-route')).toBeVisible();

  await navigationsPromise;

  expect(navigationNames).toEqual(['/another-lazy/sub/:id/:subId', '/lazy/inner/:id/:anotherId/:someAnotherId']);
});
