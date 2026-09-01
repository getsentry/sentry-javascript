import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import {
  collectStreamedSpans,
  getSpanOp,
  waitForStreamedSpan,
  waitForStreamedSpans,
} from '@sentry-internal/test-utils';

// Streamed `http.client` names are only `<METHOD> <domain>`, so the request URL has to come from
// the `url.full` attribute.
function hasUrlPart(span: SerializedStreamedSpan, part: string): boolean {
  const urlFull = span.attributes['url.full']?.value;
  return typeof urlFull === 'string' && urlFull.includes(part);
}

/** All spans of the trace `segmentSpan` belongs to, minus the segment span itself. */
function childSpansOf(spans: SerializedStreamedSpan[], segmentSpan: SerializedStreamedSpan): SerializedStreamedSpan[] {
  return spans.filter(span => span.trace_id === segmentSpan.trace_id && !span.is_segment);
}

test('Creates a pageload span with parameterized route', async ({ page }) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goto('/lazy/inner/1/2/3');
  const event = await transactionPromise;

  const lazyRouteContent = page.locator('id=innermost-lazy-route');

  await expect(lazyRouteContent).toBeVisible();

  // Validate the transaction event
  expect(event.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('pageload');
  expect(event.status).toBe('ok');
});

test('Does not create a navigation span on initial load to deep lazy route', async ({ page }) => {
  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  const pageloadPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goto('/lazy/inner/1/2/3');

  const pageloadEvent = await pageloadPromise;

  expect(pageloadEvent.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');

  const lazyRouteContent = page.locator('id=innermost-lazy-route');
  await expect(lazyRouteContent).toBeVisible();

  // "Race" between navigation transaction and a timeout to ensure no navigation transaction is created within the timeout period
  const result = await Promise.race([
    navigationPromise.then(() => 'navigation'),
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 1500)),
  ]);

  expect(result).toBe('timeout');
});

test('Creates a navigation span inside a lazy route', async ({ page }) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goto('/');

  // Check if the navigation link exists
  const navigationLink = page.locator('id=navigation');
  await expect(navigationLink).toBeVisible();

  // Click the navigation link to navigate to the lazy route
  await navigationLink.click();
  const event = await transactionPromise;

  // Check if the lazy route content is rendered
  const lazyRouteContent = page.locator('id=innermost-lazy-route');

  await expect(lazyRouteContent).toBeVisible();

  // Validate the transaction event
  expect(event.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('navigation');
  expect(event.status).toBe('ok');
});

test('Creates navigation spans between two different lazy routes', async ({ page }) => {
  // Set up transaction listeners for both navigations
  const firstTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/another-lazy/sub/:id/:subId';
  });

  const secondTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goto('/');

  // Navigate to another lazy route first
  const navigationToAnotherDeep = page.locator('id=navigation-to-another-deep');
  await expect(navigationToAnotherDeep).toBeVisible();
  await navigationToAnotherDeep.click();

  const firstEvent = await firstTransactionPromise;

  // Check if the first lazy route content is rendered
  const anotherLazyContent = page.locator('id=another-lazy-route-deep');
  await expect(anotherLazyContent).toBeVisible();

  // Validate the first transaction event
  expect(firstEvent.name).toBe('/another-lazy/sub/:id/:subId');
  expect(firstEvent.is_segment).toBe(true);
  expect(getSpanOp(firstEvent)).toBe('navigation');

  // Now navigate from the first lazy route to the second lazy route
  // Click the navigation link from within the first lazy route to the second lazy route
  const navigationToInnerFromDeep = page.locator('id=navigate-to-inner-from-deep');
  await expect(navigationToInnerFromDeep).toBeVisible();
  await navigationToInnerFromDeep.click();

  const secondEvent = await secondTransactionPromise;

  // Check if the second lazy route content is rendered
  const innerLazyContent = page.locator('id=innermost-lazy-route');
  await expect(innerLazyContent).toBeVisible();

  // Validate the second transaction event
  expect(secondEvent.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(secondEvent.is_segment).toBe(true);
  expect(getSpanOp(secondEvent)).toBe('navigation');
});

test('Creates navigation spans from inner lazy route to another lazy route with history navigation', async ({
  page,
}) => {
  await page.goto('/');

  // Navigate to inner lazy route first
  const navigationToInner = page.locator('id=navigation');
  await expect(navigationToInner).toBeVisible();

  // First, navigate to the inner lazy route
  const firstTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await navigationToInner.click();

  const firstEvent = await firstTransactionPromise;

  // Check if the inner lazy route content is rendered
  const innerLazyContent = page.locator('id=innermost-lazy-route');
  await expect(innerLazyContent).toBeVisible();

  // Validate the first transaction event
  expect(firstEvent.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(firstEvent.is_segment).toBe(true);
  expect(getSpanOp(firstEvent)).toBe('navigation');

  // Click the navigation link from within the inner lazy route to another lazy route
  const navigationToAnotherFromInner = page.locator('id=navigate-to-another-from-inner');
  await expect(navigationToAnotherFromInner).toBeVisible();

  // Now navigate from the inner lazy route to another lazy route
  const secondTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/another-lazy/sub/:id/:subId';
  });

  await navigationToAnotherFromInner.click();

  const secondEvent = await secondTransactionPromise;

  // Check if the another lazy route content is rendered
  const anotherLazyContent = page.locator('id=another-lazy-route-deep');
  await expect(anotherLazyContent).toBeVisible();

  // Validate the second transaction event
  expect(secondEvent.name).toBe('/another-lazy/sub/:id/:subId');
  expect(secondEvent.is_segment).toBe(true);
  expect(getSpanOp(secondEvent)).toBe('navigation');

  // Go back to the previous page to ensure history navigation works as expected
  const goBackTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goBack();

  const goBackEvent = await goBackTransactionPromise;

  // Validate the second go back transaction event
  expect(goBackEvent.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(goBackEvent.is_segment).toBe(true);
  expect(getSpanOp(goBackEvent)).toBe('navigation');

  // Navigate to the upper route
  const goUpperRouteTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId';
  });

  const navigationToUpper = page.locator('id=navigate-to-upper');

  await navigationToUpper.click();

  const goUpperRouteEvent = await goUpperRouteTransactionPromise;

  // Validate the go upper route transaction event
  expect(goUpperRouteEvent.name).toBe('/lazy/inner/:id/:anotherId');
  expect(goUpperRouteEvent.is_segment).toBe(true);
  expect(getSpanOp(goUpperRouteEvent)).toBe('navigation');
});

test('Does not send any duplicate navigation span names browsing between different routes', async ({ page }) => {
  const transactionNamesList: string[] = [];

  // Monitor and add all transaction names sent to Sentry for the navigations
  const allTransactionsPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (span.is_segment) {
      transactionNamesList.push(span.name);
    }

    if (transactionNamesList.length >= 5) {
      // Stop monitoring once we have enough transaction names
      return true;
    }

    return false;
  });

  // Go to root page
  await page.goto('/');
  await page.waitForTimeout(1000);

  // Navigate to inner lazy route
  const navigationToInner = page.locator('id=navigation');
  await expect(navigationToInner).toBeVisible();
  await navigationToInner.click();

  // Navigate to another lazy route
  const navigationToAnother = page.locator('id=navigate-to-another-from-inner');
  await expect(navigationToAnother).toBeVisible();
  await page.waitForTimeout(1000);

  // Click to navigate to another lazy route
  await navigationToAnother.click();
  const anotherLazyRouteContent = page.locator('id=another-lazy-route-deep');
  await expect(anotherLazyRouteContent).toBeVisible();
  await page.waitForTimeout(1000);

  // Navigate back to inner lazy route
  await page.goBack();
  await expect(page.locator('id=innermost-lazy-route')).toBeVisible();
  await page.waitForTimeout(1000);

  // Navigate to upper inner lazy route
  const navigationToUpper = page.locator('id=navigate-to-upper');
  await expect(navigationToUpper).toBeVisible();
  await navigationToUpper.click();

  await page.waitForTimeout(1000);

  await allTransactionsPromise;

  expect(transactionNamesList.length).toBe(5);
  expect(transactionNamesList).toEqual([
    '/',
    '/lazy/inner/:id/:anotherId/:someAnotherId',
    '/another-lazy/sub/:id/:subId',
    '/lazy/inner/:id/:anotherId/:someAnotherId',
    '/lazy/inner/:id/:anotherId',
  ]);
});

test('Does not create premature navigation span during long-running lazy route pageload', async ({ page }) => {
  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name.includes('long-running');
  });

  const pageloadPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/long-running/slow/:id';
  });

  await page.goto('/long-running/slow/12345');

  const pageloadEvent = await pageloadPromise;

  expect(pageloadEvent.name).toBe('/long-running/slow/:id');
  expect(getSpanOp(pageloadEvent)).toBe('pageload');

  const slowLoadingContent = page.locator('id=slow-loading-content');
  await expect(slowLoadingContent).toBeVisible({ timeout: 5000 });

  const result = await Promise.race([
    navigationPromise.then(() => 'navigation'),
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 2000)),
  ]);

  // Should timeout, meaning no unwanted navigation transaction was created
  expect(result).toBe('timeout');
});

test('Allows legitimate POP navigation (back/forward) after pageload completes', async ({ page }) => {
  await page.goto('/');

  const navigationToLongRunning = page.locator('id=navigation-to-long-running');
  await expect(navigationToLongRunning).toBeVisible();

  // Set up transaction listeners for both navigations
  const firstNavigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/long-running/slow/:id';
  });

  const backNavigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/';
  });

  await navigationToLongRunning.click();

  const slowLoadingContent = page.locator('id=slow-loading-content');
  await expect(slowLoadingContent).toBeVisible({ timeout: 5000 });

  const firstNavigationEvent = await firstNavigationPromise;

  expect(firstNavigationEvent.name).toBe('/long-running/slow/:id');
  expect(getSpanOp(firstNavigationEvent)).toBe('navigation');

  // Now navigate back using browser back button (POP event)
  // This should create a navigation transaction since pageload is complete
  await page.goBack();

  // Verify we're back at home
  const homeLink = page.locator('id=navigation');
  await expect(homeLink).toBeVisible();

  const backNavigationEvent = await backNavigationPromise;

  // Validate that the back navigation (POP) was properly tracked
  expect(backNavigationEvent.name).toBe('/');
  expect(getSpanOp(backNavigationEvent)).toBe('navigation');
});

test('Updates pageload span name correctly when span is cancelled early (document.hidden simulation)', async ({
  page,
}) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  // Set up the page to simulate document.hidden before navigation
  await page.addInitScript(() => {
    // Wait a bit for Sentry to initialize and start the pageload span
    setTimeout(() => {
      // Override document.hidden to simulate tab switching
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: function () {
          return true;
        },
      });

      // Dispatch visibilitychange event to trigger the idle span cancellation logic
      document.dispatchEvent(new Event('visibilitychange'));
    }, 100); // Small delay to ensure the span has started
  });

  // Navigate to the lazy route URL
  await page.goto('/lazy/inner/1/2/3');

  const event = await transactionPromise;

  // Verify the lazy route content eventually loads (even though span was cancelled early)
  const lazyRouteContent = page.locator('id=innermost-lazy-route');
  await expect(lazyRouteContent).toBeVisible();

  // Validate that the transaction event has the correct parameterized route name
  // even though the span was cancelled early due to document.hidden
  expect(event.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('pageload');

  // Check if the span was indeed cancelled (should have idle_span_finish_reason attribute)
  const idleSpanFinishReason = event.attributes['sentry.idle_span_finish_reason']?.value;
  if (idleSpanFinishReason) {
    // If the span was cancelled due to visibility change, verify it still got the right name
    expect(['externalFinish', 'cancelled']).toContain(idleSpanFinishReason);
  }
});

test('Updates navigation span name correctly when span is cancelled early (document.hidden simulation)', async ({
  page,
}) => {
  // First go to home page
  await page.goto('/');

  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  // Set up a listener to simulate document.hidden after clicking the navigation link
  await page.evaluate(() => {
    // Override document.hidden to simulate tab switching
    let hiddenValue = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: function () {
        return hiddenValue;
      },
    });

    // Listen for clicks on the navigation link and simulate document.hidden shortly after
    document.addEventListener(
      'click',
      () => {
        setTimeout(() => {
          hiddenValue = true;
          // Dispatch visibilitychange event to trigger the idle span cancellation logic
          document.dispatchEvent(new Event('visibilitychange'));
        }, 50); // Small delay to ensure the navigation span has started
      },
      { once: true },
    );
  });

  // Click the navigation link to navigate to the lazy route
  const navigationLink = page.locator('id=navigation');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const event = await navigationPromise;

  // Verify the lazy route content eventually loads (even though span was cancelled early)
  const lazyRouteContent = page.locator('id=innermost-lazy-route');
  await expect(lazyRouteContent).toBeVisible();

  // Validate that the transaction event has the correct parameterized route name
  // even though the span was cancelled early due to document.hidden
  expect(event.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('navigation');

  // Check if the span was indeed cancelled (should have cancellation_reason attribute or idle_span_finish_reason)
  const cancellationReason = event.attributes['sentry.cancellation_reason']?.value;
  const idleSpanFinishReason = event.attributes['sentry.idle_span_finish_reason']?.value;

  // Verify that the span was cancelled due to document.hidden
  if (cancellationReason) {
    expect(cancellationReason).toBe('document.hidden');
  }

  if (idleSpanFinishReason) {
    expect(['externalFinish', 'cancelled']).toContain(idleSpanFinishReason);
  }
});

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

test('Creates pageload span with parameterized route for delayed lazy route', async ({ page }) => {
  const pageloadPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/delayed-lazy/:id';
  });

  await page.goto('/delayed-lazy/123');

  const pageloadEvent = await pageloadPromise;

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();
  await expect(page.locator('id=delayed-lazy-id')).toHaveText('ID: 123');
  await expect(page.locator('id=delayed-lazy-path')).toHaveText('/delayed-lazy/123');

  expect(pageloadEvent.name).toBe('/delayed-lazy/:id');
  expect(getSpanOp(pageloadEvent)).toBe('pageload');
  expect(pageloadEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Creates navigation span with parameterized route for delayed lazy route', async ({ page }) => {
  await page.goto('/');

  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/delayed-lazy/:id';
  });

  const navigationLink = page.locator('id=navigation-to-delayed-lazy');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const navigationEvent = await navigationPromise;

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();
  await expect(page.locator('id=delayed-lazy-id')).toHaveText('ID: 123');
  await expect(page.locator('id=delayed-lazy-path')).toHaveText('/delayed-lazy/123');

  expect(navigationEvent.name).toBe('/delayed-lazy/:id');
  expect(getSpanOp(navigationEvent)).toBe('navigation');
  expect(navigationEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
});

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

test('Creates separate navigation span when changing only query parameters on same route', async ({ page }) => {
  await page.goto('/delayed-lazy/123');

  // Wait for the page to fully load
  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();

  // Navigate from /delayed-lazy/123 to /delayed-lazy/123?view=detailed
  // This is a query-only change on the same route
  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/delayed-lazy/:id';
  });

  const queryLink = page.locator('id=link-to-query-view-detailed');
  await expect(queryLink).toBeVisible();
  await queryLink.click();

  const navigationEvent = await navigationPromise;

  // Verify query param was updated
  await expect(page.locator('id=delayed-lazy-search')).toHaveText('?view=detailed');
  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: detailed');

  // Query-only navigation should create a navigation transaction
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

  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: detailed');

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

test('Creates navigation span when changing only hash on same route', async ({ page }) => {
  await page.goto('/delayed-lazy/123');

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();

  // Navigate from /delayed-lazy/123 to /delayed-lazy/123#section1
  // This is a hash-only change on the same route
  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/delayed-lazy/:id';
  });

  const hashLink = page.locator('id=link-to-hash-section1');
  await expect(hashLink).toBeVisible();
  await hashLink.click();

  const navigationEvent = await navigationPromise;

  // Verify hash was updated
  await expect(page.locator('id=delayed-lazy-hash')).toHaveText('#section1');

  // Hash-only navigation should create a navigation transaction
  expect(navigationEvent.name).toBe('/delayed-lazy/:id');
  expect(getSpanOp(navigationEvent)).toBe('navigation');
  expect(navigationEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(navigationEvent.status).toBe('ok');
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

test('Creates navigation span with correct name for slow lazy route', async ({ page }) => {
  // This test verifies that navigating to a slow lazy route (with top-level await)
  // creates a correctly named navigation transaction.
  // The route uses handle.lazyChildren with a 500ms delay.

  await page.goto('/');

  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/slow-fetch/:id';
  });

  // Navigate to slow-fetch route (500ms delay)
  const navigationToSlowFetch = page.locator('id=navigation-to-slow-fetch');
  await expect(navigationToSlowFetch).toBeVisible();
  await navigationToSlowFetch.click();

  const navigationEvent = await navigationPromise;

  // Wait for the component to render (after the 500ms delay)
  const slowFetchContent = page.locator('id=slow-fetch-content');
  await expect(slowFetchContent).toBeVisible({ timeout: 5000 });
  await expect(page.locator('id=slow-fetch-id')).toHaveText('ID: 123');

  // Verify the transaction has the correct parameterized route name
  expect(navigationEvent.name).toBe('/slow-fetch/:id');
  expect(getSpanOp(navigationEvent)).toBe('navigation');
  expect(navigationEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Rapid navigation does not corrupt span names when lazy handlers resolve late', async ({ page }) => {
  await page.goto('/');

  const allTransactions: Array<{ name: string; op: string }> = [];

  const collectorPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (span.is_segment && getSpanOp(span)) {
      allTransactions.push({
        name: span.name,
        op: getSpanOp(span) ?? '',
      });
    }
    return allTransactions.length >= 2;
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
  await page.waitForTimeout(3000);

  await Promise.race([
    collectorPromise,
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 15000)),
  ]);

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

  const spansPromise = collectStreamedSpans('react-router-7-lazy-routes', spans => {
    return spans.some(span => getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/slow-fetch/:id');
  });

  await page.goto('/slow-fetch/123');

  const spans = await spansPromise;
  const pageloadSpan = spans.find(span => getSpanOp(span) === 'pageload' && span.is_segment)!;

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

  const navigationCollector = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (getSpanOp(span) === 'navigation') {
      navigationTransactions.push({ name: span.name });
    }
    return false;
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
  await page.waitForTimeout(2000);

  await Promise.race([
    navigationCollector,
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 5000)),
  ]).catch(() => {});

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

  const collector = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (getSpanOp(span) === 'navigation') {
      navigationTransactions.push({ name: span.name });
    }
    return false;
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
  await page.waitForTimeout(3000);

  await Promise.race([collector, new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 5000))]).catch(
    () => {},
  );

  expect(navigationTransactions.length).toBeGreaterThanOrEqual(1);

  // No "/" corruption
  const corruptedToRoot = navigationTransactions.filter(t => t.name === '/');
  expect(corruptedToRoot.length).toBe(0);
});

test('Browser back during lazy handler resolution does not corrupt', async ({ page }) => {
  const allTransactions: Array<{ name: string; op: string }> = [];

  const collector = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (span.is_segment && getSpanOp(span)) {
      allTransactions.push({
        name: span.name,
        op: getSpanOp(span) ?? '',
      });
    }
    return false;
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
  await page.goBack();
  await page.waitForTimeout(3000);

  await Promise.race([collector, new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 10000))]).catch(
    () => {},
  );

  expect(allTransactions.length).toBeGreaterThanOrEqual(1);
  expect(allTransactions.every(t => t.name.length > 0)).toBe(true);
});

test('Multiple overlapping lazy handlers do not corrupt each other', async ({ page }) => {
  const navigationTransactions: Array<{ name: string }> = [];

  const collector = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (getSpanOp(span) === 'navigation') {
      navigationTransactions.push({ name: span.name });
    }
    return false;
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
  await page.waitForTimeout(3000);

  await Promise.race([collector, new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 5000))]).catch(
    () => {},
  );

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

test('Query/hash navigation does not corrupt span name', async ({ page }) => {
  const navigationTransactions: Array<{ name: string }> = [];

  const collectorPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (span.is_segment && getSpanOp(span) === 'navigation') {
      navigationTransactions.push({ name: span.name });
    }
    return navigationTransactions.length >= 1;
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
  await page.waitForTimeout(500);
  expect(page.url()).toContain('#section1');

  // Trigger combined query+hash navigation
  const combinedLink = page.locator('id=link-to-query-and-hash');
  await expect(combinedLink).toBeVisible();
  await combinedLink.click();
  await page.waitForTimeout(500);
  expect(page.url()).toContain('view=grid');
  expect(page.url()).toContain('#results');

  await page.waitForTimeout(2000);
  await Promise.race([
    collectorPromise,
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 5000)),
  ]).catch(() => {});

  expect(navigationTransactions.length).toBeGreaterThanOrEqual(1);
  expect(navigationTransactions[0].name).toBe('/delayed-lazy/:id');

  // No "/" corruption from query/hash navigations
  const corruptedToRoot = navigationTransactions.filter(t => t.name === '/');
  expect(corruptedToRoot.length).toBe(0);
});

// Regression: Pageload to slow lazy route should get parameterized name even if span ends early
test('Slow lazy route pageload with early span end still gets parameterized route name (regression)', async ({
  page,
}) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name.startsWith('/slow-fetch');
  });

  // idleTimeout=300 ends span before 500ms lazy route loads, timeout=1000 waits for lazy routes
  await page.goto('/slow-fetch/123?idleTimeout=300&timeout=1000');

  const event = await transactionPromise;

  expect(event.name).toBe('/slow-fetch/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('pageload');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');

  const idleSpanFinishReason = event.attributes['sentry.idle_span_finish_reason']?.value;
  expect(['idleTimeout', 'externalFinish']).toContain(idleSpanFinishReason);
});

// Regression: Wildcard route names should be upgraded to parameterized routes when lazy routes load
test('Wildcard route pageload gets upgraded to parameterized route name (regression)', async ({ page }) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name.startsWith('/wildcard-lazy');
  });

  await page.goto('/wildcard-lazy/456?idleTimeout=300&timeout=1000');

  const event = await transactionPromise;

  expect(event.name).toBe('/wildcard-lazy/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('pageload');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');
});

// Regression: Navigation to slow lazy route should get parameterized name even if span ends early.
// Network activity from dynamic imports extends the idle timeout until lazy routes load.
test('Slow lazy route navigation with early span end still gets parameterized route name (regression)', async ({
  page,
}) => {
  // Configure short idle timeout (300ms) but longer lazy route timeout (1000ms)
  await page.goto('/?idleTimeout=300&timeout=1000');

  // Wait for pageload to complete
  await page.waitForTimeout(500);

  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name.startsWith('/wildcard-lazy');
  });

  // Navigate to wildcard-lazy route (500ms delay in module via top-level await)
  // The dynamic import creates network activity that extends the span lifetime
  const wildcardLazyLink = page.locator('id=navigation-to-wildcard-lazy');
  await expect(wildcardLazyLink).toBeVisible();
  await wildcardLazyLink.click();

  const event = await navigationPromise;

  // The navigation transaction should have the parameterized route name
  expect(event.name).toBe('/wildcard-lazy/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('navigation');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Captured navigation context is used instead of stale window.location during rapid navigation', async ({
  page,
}) => {
  // Validates fix for race condition where captureCurrentLocation would use stale WINDOW.location.
  // Navigate to slow route, then quickly to another route before lazy handler resolves.
  await page.goto('/');

  const allNavigationTransactions: Array<{ name: string; traceId: string }> = [];

  const collectorPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (span.is_segment && getSpanOp(span) === 'navigation') {
      allNavigationTransactions.push({
        name: span.name,
        traceId: span.trace_id || '',
      });
    }
    return allNavigationTransactions.length >= 2;
  });

  const slowFetchLink = page.locator('id=navigation-to-slow-fetch');
  await expect(slowFetchLink).toBeVisible();
  await slowFetchLink.click();

  // Navigate away quickly before slow-fetch's async handler resolves
  await page.waitForTimeout(50);

  const anotherLink = page.locator('id=navigation-to-another');
  await anotherLink.click();

  await expect(page.locator('id=another-lazy-route')).toBeVisible({ timeout: 10000 });

  await page.waitForTimeout(2000);

  await Promise.race([
    collectorPromise,
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 3000)),
  ]).catch(() => {});

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

  const collectorPromise = waitForStreamedSpans('react-router-7-lazy-routes', spans => {
    streamedSpans.push(...spans);
    return false;
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

  // Wait for slow-fetch lazy handler to complete and spans to be sent
  await page.waitForTimeout(2000);

  await Promise.race([
    collectorPromise,
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 3000)),
  ]).catch(() => {});

  const navigationSegmentSpans = streamedSpans.filter(span => getSpanOp(span) === 'navigation' && span.is_segment);
  expect(navigationSegmentSpans.length).toBeGreaterThanOrEqual(1);

  // /another-lazy segment must have the correct name, not "/slow-fetch/:id"
  const anotherLazySegment = navigationSegmentSpans.find(span => span.name.startsWith('/another-lazy/sub'));
  expect(anotherLazySegment).toBeDefined();

  // Key assertion 2: the /another-lazy trace must NOT contain spans from the /slow-fetch route.
  // The /api/slow-data fetch is triggered by the slow-fetch route's lazy loading.
  if (anotherLazySegment) {
    const leakedSpans = childSpansOf(streamedSpans, anotherLazySegment).filter(span => hasUrlPart(span, 'slow-data'));
    expect(leakedSpans.length).toBe(0);
  }

  // Key assertion 3: If a slow-fetch segment exists, verify it has the correct name
  // (not corrupted to /another-lazy)
  const slowFetchSegment = navigationSegmentSpans.find(span => span.name.includes('slow-fetch'));
  if (slowFetchSegment) {
    expect(slowFetchSegment.name).toMatch(/\/slow-fetch/);
    // Verify the slow-fetch trace doesn't contain spans that belong to /another-lazy
    const wrongSpans = childSpansOf(streamedSpans, slowFetchSegment).filter(span => hasUrlPart(span, 'another-lazy'));
    expect(wrongSpans.length).toBe(0);
  }
});

// lazyRouteManifest: provides parameterized name when lazy routes don't resolve in time
test('Route manifest provides correct name when navigation span ends before lazy route resolves', async ({ page }) => {
  // Short idle timeout (50ms) ensures span ends before lazy route (500ms) resolves
  await page.goto('/?idleTimeout=50&timeout=0');

  // Wait for pageload to complete
  await page.waitForTimeout(200);

  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name.startsWith('/wildcard-lazy');
  });

  // Navigate to wildcard-lazy route (500ms delay in module via top-level await)
  const wildcardLazyLink = page.locator('id=navigation-to-wildcard-lazy');
  await expect(wildcardLazyLink).toBeVisible();
  await wildcardLazyLink.click();

  const event = await navigationPromise;

  // Should have parameterized name from manifest, not wildcard (/wildcard-lazy/*)
  expect(event.name).toBe('/wildcard-lazy/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('navigation');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Route manifest provides correct name when pageload span ends before lazy route resolves', async ({ page }) => {
  // Short idle timeout (50ms) ensures span ends before lazy route (500ms) resolves
  const pageloadPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name.startsWith('/wildcard-lazy');
  });

  await page.goto('/wildcard-lazy/123?idleTimeout=50&timeout=0');

  const event = await pageloadPromise;

  // Should have parameterized name from manifest, not wildcard (/wildcard-lazy/*)
  expect(event.name).toBe('/wildcard-lazy/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('pageload');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('GQL fetch span is attributed to the correct navigation segment when navigating from index to lazy GQL page', async ({
  page,
}) => {
  const pageloadSpansPromise = collectStreamedSpans('react-router-7-lazy-routes', spans => {
    return spans.some(span => getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/');
  });

  await page.goto('/');
  const pageloadSpans = await pageloadSpansPromise;
  const pageloadSegment = pageloadSpans.find(span => getSpanOp(span) === 'pageload' && span.is_segment)!;

  // Pageload should NOT contain any /api/graphql spans (neither UserAQuery nor UserBQuery)
  const pageloadGqlSpans = childSpansOf(pageloadSpans, pageloadSegment).filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, '/api/graphql'),
  );
  expect(pageloadGqlSpans.length).toBe(0);

  const navigationSpansPromise = collectStreamedSpans('react-router-7-lazy-routes', spans => {
    return spans.some(span => getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy-gql-a/fetch');
  });

  // Navigate to lazy GQL page A
  const gqlLink = page.locator('id=navigation-to-gql-a');
  await expect(gqlLink).toBeVisible();
  await gqlLink.click();

  const navigationSpans = await navigationSpansPromise;
  const navigationSegment = navigationSpans.find(
    span => getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy-gql-a/fetch',
  )!;

  // Verify the lazy GQL page rendered
  await expect(page.locator('id=gql-page-a')).toBeVisible();

  // Verify the navigation segment has the correct name
  expect(navigationSegment.name).toBe('/lazy-gql-a/fetch');
  expect(getSpanOp(navigationSegment)).toBe('navigation');

  // Verify the UserAQuery GQL fetch span is inside this navigation segment's trace
  const navChildSpans = childSpansOf(navigationSpans, navigationSegment);
  const userASpans = navChildSpans.filter(span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserAQuery'));
  expect(userASpans.length).toBe(1);

  // Verify NO UserBQuery spans leaked into this trace
  const userBSpans = navChildSpans.filter(span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserBQuery'));
  expect(userBSpans.length).toBe(0);
});

test('GQL fetch spans are attributed to correct navigation segments when navigating between two lazy GQL pages', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForTimeout(500);

  // Navigate to GQL page A
  const firstNavSpansPromise = collectStreamedSpans('react-router-7-lazy-routes', spans => {
    return spans.some(span => getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy-gql-a/fetch');
  });

  const gqlALink = page.locator('id=navigation-to-gql-a');
  await expect(gqlALink).toBeVisible();
  await gqlALink.click();

  const firstNavSpans = await firstNavSpansPromise;
  const firstNavSegment = firstNavSpans.find(
    span => getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy-gql-a/fetch',
  )!;
  await expect(page.locator('id=gql-page-a')).toBeVisible();

  // First navigation should have exactly the UserAQuery span
  const firstNavChildSpans = childSpansOf(firstNavSpans, firstNavSegment);
  const firstUserASpans = firstNavChildSpans.filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserAQuery'),
  );
  expect(firstUserASpans.length).toBe(1);

  // First navigation must NOT contain UserBQuery spans
  const firstUserBSpans = firstNavChildSpans.filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserBQuery'),
  );
  expect(firstUserBSpans.length).toBe(0);

  // Now navigate from GQL page A to GQL page B
  const secondNavSpansPromise = collectStreamedSpans('react-router-7-lazy-routes', spans => {
    return spans.some(span => getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy-gql-b/fetch');
  });

  const gqlBLink = page.locator('id=navigate-to-gql-b');
  await expect(gqlBLink).toBeVisible();
  await gqlBLink.click();

  const secondNavSpans = await secondNavSpansPromise;
  const secondNavSegment = secondNavSpans.find(
    span => getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy-gql-b/fetch',
  )!;
  await expect(page.locator('id=gql-page-b')).toBeVisible();

  // Second navigation should have exactly the UserBQuery span
  const secondNavChildSpans = childSpansOf(secondNavSpans, secondNavSegment);
  const secondUserBSpans = secondNavChildSpans.filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserBQuery'),
  );
  expect(secondUserBSpans.length).toBe(1);

  // Second navigation must NOT contain UserAQuery spans (no leaking from first nav)
  const secondUserASpans = secondNavChildSpans.filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserAQuery'),
  );
  expect(secondUserASpans.length).toBe(0);

  // Verify the two segments have different trace IDs
  expect(firstNavSegment.trace_id).toBeDefined();
  expect(secondNavSegment.trace_id).toBeDefined();
  expect(firstNavSegment.trace_id).not.toBe(secondNavSegment.trace_id);
});
