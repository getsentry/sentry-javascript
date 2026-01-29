import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Creates a pageload transaction with parameterized route', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goto('/lazy/inner/1/2/3');
  const event = await transactionPromise;

  const lazyRouteContent = page.locator('id=innermost-lazy-route');

  await expect(lazyRouteContent).toBeVisible();

  // Validate the transaction event
  expect(event.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('pageload');
  expect(event.contexts?.trace?.status).toBe('ok');
});

test('Does not create a navigation transaction on initial load to deep lazy route', async ({ page }) => {
  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  const pageloadPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goto('/lazy/inner/1/2/3');

  const pageloadEvent = await pageloadPromise;

  expect(pageloadEvent.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');

  const lazyRouteContent = page.locator('id=innermost-lazy-route');
  await expect(lazyRouteContent).toBeVisible();

  // "Race" between navigation transaction and a timeout to ensure no navigation transaction is created within the timeout period
  const result = await Promise.race([
    navigationPromise.then(() => 'navigation'),
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 1500)),
  ]);

  expect(result).toBe('timeout');
});

test('Creates a navigation transaction inside a lazy route', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
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
  expect(event.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('navigation');
  expect(event.contexts?.trace?.status).toBe('ok');
});

test('Creates navigation transactions between two different lazy routes', async ({ page }) => {
  // Set up transaction listeners for both navigations
  const firstTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/another-lazy/sub/:id/:subId'
    );
  });

  const secondTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
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
  expect(firstEvent.transaction).toBe('/another-lazy/sub/:id/:subId');
  expect(firstEvent.type).toBe('transaction');
  expect(firstEvent.contexts?.trace?.op).toBe('navigation');

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
  expect(secondEvent.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(secondEvent.type).toBe('transaction');
  expect(secondEvent.contexts?.trace?.op).toBe('navigation');
});

test('Creates navigation transactions from inner lazy route to another lazy route with history navigation', async ({
  page,
}) => {
  await page.goto('/');

  // Navigate to inner lazy route first
  const navigationToInner = page.locator('id=navigation');
  await expect(navigationToInner).toBeVisible();

  // First, navigate to the inner lazy route
  const firstTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await navigationToInner.click();

  const firstEvent = await firstTransactionPromise;

  // Check if the inner lazy route content is rendered
  const innerLazyContent = page.locator('id=innermost-lazy-route');
  await expect(innerLazyContent).toBeVisible();

  // Validate the first transaction event
  expect(firstEvent.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(firstEvent.type).toBe('transaction');
  expect(firstEvent.contexts?.trace?.op).toBe('navigation');

  // Click the navigation link from within the inner lazy route to another lazy route
  const navigationToAnotherFromInner = page.locator('id=navigate-to-another-from-inner');
  await expect(navigationToAnotherFromInner).toBeVisible();

  // Now navigate from the inner lazy route to another lazy route
  const secondTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/another-lazy/sub/:id/:subId'
    );
  });

  await navigationToAnotherFromInner.click();

  const secondEvent = await secondTransactionPromise;

  // Check if the another lazy route content is rendered
  const anotherLazyContent = page.locator('id=another-lazy-route-deep');
  await expect(anotherLazyContent).toBeVisible();

  // Validate the second transaction event
  expect(secondEvent.transaction).toBe('/another-lazy/sub/:id/:subId');
  expect(secondEvent.type).toBe('transaction');
  expect(secondEvent.contexts?.trace?.op).toBe('navigation');

  // Go back to the previous page to ensure history navigation works as expected
  const goBackTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goBack();

  const goBackEvent = await goBackTransactionPromise;

  // Validate the second go back transaction event
  expect(goBackEvent.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(goBackEvent.type).toBe('transaction');
  expect(goBackEvent.contexts?.trace?.op).toBe('navigation');

  // Navigate to the upper route
  const goUpperRouteTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId'
    );
  });

  const navigationToUpper = page.locator('id=navigate-to-upper');

  await navigationToUpper.click();

  const goUpperRouteEvent = await goUpperRouteTransactionPromise;

  // Validate the go upper route transaction event
  expect(goUpperRouteEvent.transaction).toBe('/lazy/inner/:id/:anotherId');
  expect(goUpperRouteEvent.type).toBe('transaction');
  expect(goUpperRouteEvent.contexts?.trace?.op).toBe('navigation');
});

test('Does not send any duplicate navigation transaction names browsing between different routes', async ({ page }) => {
  const transactionNamesList: string[] = [];

  // Monitor and add all transaction names sent to Sentry for the navigations
  const allTransactionsPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (transactionEvent?.transaction) {
      transactionNamesList.push(transactionEvent.transaction);
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

test('Does not create premature navigation transaction during long-running lazy route pageload', async ({ page }) => {
  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction.includes('long-running')
    );
  });

  const pageloadPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/long-running/slow/:id'
    );
  });

  await page.goto('/long-running/slow/12345');

  const pageloadEvent = await pageloadPromise;

  expect(pageloadEvent.transaction).toBe('/long-running/slow/:id');
  expect(pageloadEvent.contexts?.trace?.op).toBe('pageload');

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
  const firstNavigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/long-running/slow/:id'
    );
  });

  const backNavigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/'
    );
  });

  await navigationToLongRunning.click();

  const slowLoadingContent = page.locator('id=slow-loading-content');
  await expect(slowLoadingContent).toBeVisible({ timeout: 5000 });

  const firstNavigationEvent = await firstNavigationPromise;

  expect(firstNavigationEvent.transaction).toBe('/long-running/slow/:id');
  expect(firstNavigationEvent.contexts?.trace?.op).toBe('navigation');

  // Now navigate back using browser back button (POP event)
  // This should create a navigation transaction since pageload is complete
  await page.goBack();

  // Verify we're back at home
  const homeLink = page.locator('id=navigation');
  await expect(homeLink).toBeVisible();

  const backNavigationEvent = await backNavigationPromise;

  // Validate that the back navigation (POP) was properly tracked
  expect(backNavigationEvent.transaction).toBe('/');
  expect(backNavigationEvent.contexts?.trace?.op).toBe('navigation');
});

test('Updates pageload transaction name correctly when span is cancelled early (document.hidden simulation)', async ({
  page,
}) => {
  const transactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
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
  expect(event.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('pageload');

  // Check if the span was indeed cancelled (should have idle_span_finish_reason attribute)
  const idleSpanFinishReason = event.contexts?.trace?.data?.['sentry.idle_span_finish_reason'];
  if (idleSpanFinishReason) {
    // If the span was cancelled due to visibility change, verify it still got the right name
    expect(['externalFinish', 'cancelled']).toContain(idleSpanFinishReason);
  }
});

test('Updates navigation transaction name correctly when span is cancelled early (document.hidden simulation)', async ({
  page,
}) => {
  // First go to home page
  await page.goto('/');

  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
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
  expect(event.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('navigation');

  // Check if the span was indeed cancelled (should have cancellation_reason attribute or idle_span_finish_reason)
  const cancellationReason = event.contexts?.trace?.data?.['sentry.cancellation_reason'];
  const idleSpanFinishReason = event.contexts?.trace?.data?.['sentry.idle_span_finish_reason'];

  // Verify that the span was cancelled due to document.hidden
  if (cancellationReason) {
    expect(cancellationReason).toBe('document.hidden');
  }

  if (idleSpanFinishReason) {
    expect(['externalFinish', 'cancelled']).toContain(idleSpanFinishReason);
  }
});

test('Creates separate transactions for rapid consecutive navigations', async ({ page }) => {
  await page.goto('/');

  // Set up transaction listeners
  const firstTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  const secondTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/another-lazy/sub/:id/:subId'
    );
  });

  // Third navigation promise - using counter to match second occurrence of same route
  let innerRouteMatchCount = 0;
  const thirdTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (
      transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
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
  expect(firstEvent.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(firstEvent.contexts?.trace?.op).toBe('navigation');
  const firstTraceId = firstEvent.contexts?.trace?.trace_id;
  const firstSpanId = firstEvent.contexts?.trace?.span_id;

  expect(secondEvent.transaction).toBe('/another-lazy/sub/:id/:subId');
  expect(secondEvent.contexts?.trace?.op).toBe('navigation');
  expect(secondEvent.contexts?.trace?.status).toBe('ok');

  const secondTraceId = secondEvent.contexts?.trace?.trace_id;
  const secondSpanId = secondEvent.contexts?.trace?.span_id;

  // Verify third transaction
  expect(thirdEvent.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(thirdEvent.contexts?.trace?.op).toBe('navigation');
  expect(thirdEvent.contexts?.trace?.status).toBe('ok');

  const thirdTraceId = thirdEvent.contexts?.trace?.trace_id;
  const thirdSpanId = thirdEvent.contexts?.trace?.span_id;

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

test('Creates pageload transaction with parameterized route for delayed lazy route', async ({ page }) => {
  const pageloadPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/delayed-lazy/:id'
    );
  });

  await page.goto('/delayed-lazy/123');

  const pageloadEvent = await pageloadPromise;

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();
  await expect(page.locator('id=delayed-lazy-id')).toHaveText('ID: 123');
  await expect(page.locator('id=delayed-lazy-path')).toHaveText('/delayed-lazy/123');

  expect(pageloadEvent.transaction).toBe('/delayed-lazy/:id');
  expect(pageloadEvent.contexts?.trace?.op).toBe('pageload');
  expect(pageloadEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Creates navigation transaction with parameterized route for delayed lazy route', async ({ page }) => {
  await page.goto('/');

  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/delayed-lazy/:id'
    );
  });

  const navigationLink = page.locator('id=navigation-to-delayed-lazy');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const navigationEvent = await navigationPromise;

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();
  await expect(page.locator('id=delayed-lazy-id')).toHaveText('ID: 123');
  await expect(page.locator('id=delayed-lazy-path')).toHaveText('/delayed-lazy/123');

  expect(navigationEvent.transaction).toBe('/delayed-lazy/:id');
  expect(navigationEvent.contexts?.trace?.op).toBe('navigation');
  expect(navigationEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Creates navigation transaction when navigating with query parameters from home to route', async ({ page }) => {
  await page.goto('/');

  // Navigate from / to /delayed-lazy/123?source=homepage
  // This should create a navigation transaction with the parameterized route name
  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/delayed-lazy/:id'
    );
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
  expect(navigationEvent.transaction).toBe('/delayed-lazy/:id');
  expect(navigationEvent.contexts?.trace?.op).toBe('navigation');
  expect(navigationEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
  expect(navigationEvent.contexts?.trace?.status).toBe('ok');
});

test('Creates separate navigation transaction when changing only query parameters on same route', async ({ page }) => {
  await page.goto('/delayed-lazy/123');

  // Wait for the page to fully load
  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();

  // Navigate from /delayed-lazy/123 to /delayed-lazy/123?view=detailed
  // This is a query-only change on the same route
  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/delayed-lazy/:id'
    );
  });

  const queryLink = page.locator('id=link-to-query-view-detailed');
  await expect(queryLink).toBeVisible();
  await queryLink.click();

  const navigationEvent = await navigationPromise;

  // Verify query param was updated
  await expect(page.locator('id=delayed-lazy-search')).toHaveText('?view=detailed');
  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: detailed');

  // Query-only navigation should create a navigation transaction
  expect(navigationEvent.transaction).toBe('/delayed-lazy/:id');
  expect(navigationEvent.contexts?.trace?.op).toBe('navigation');
  expect(navigationEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
  expect(navigationEvent.contexts?.trace?.status).toBe('ok');
});

test('Creates separate navigation transactions for multiple query parameter changes', async ({ page }) => {
  await page.goto('/delayed-lazy/123');

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();

  // First query change: /delayed-lazy/123 -> /delayed-lazy/123?view=detailed
  const firstNavigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/delayed-lazy/:id'
    );
  });

  const firstQueryLink = page.locator('id=link-to-query-view-detailed');
  await expect(firstQueryLink).toBeVisible();
  await firstQueryLink.click();

  const firstNavigationEvent = await firstNavigationPromise;
  const firstTraceId = firstNavigationEvent.contexts?.trace?.trace_id;

  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: detailed');

  // Second query change: /delayed-lazy/123?view=detailed -> /delayed-lazy/123?view=list
  const secondNavigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/delayed-lazy/:id' &&
      transactionEvent.contexts?.trace?.trace_id !== firstTraceId
    );
  });

  const secondQueryLink = page.locator('id=link-to-query-view-list');
  await expect(secondQueryLink).toBeVisible();
  await secondQueryLink.click();

  const secondNavigationEvent = await secondNavigationPromise;
  const secondTraceId = secondNavigationEvent.contexts?.trace?.trace_id;

  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: list');

  // Both navigations should have created separate transactions
  expect(firstNavigationEvent.transaction).toBe('/delayed-lazy/:id');
  expect(firstNavigationEvent.contexts?.trace?.op).toBe('navigation');
  expect(secondNavigationEvent.transaction).toBe('/delayed-lazy/:id');
  expect(secondNavigationEvent.contexts?.trace?.op).toBe('navigation');

  // Trace IDs should be different (separate transactions)
  expect(firstTraceId).toBeDefined();
  expect(secondTraceId).toBeDefined();
  expect(firstTraceId).not.toBe(secondTraceId);
});

test('Creates navigation transaction when changing only hash on same route', async ({ page }) => {
  await page.goto('/delayed-lazy/123');

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();

  // Navigate from /delayed-lazy/123 to /delayed-lazy/123#section1
  // This is a hash-only change on the same route
  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/delayed-lazy/:id'
    );
  });

  const hashLink = page.locator('id=link-to-hash-section1');
  await expect(hashLink).toBeVisible();
  await hashLink.click();

  const navigationEvent = await navigationPromise;

  // Verify hash was updated
  await expect(page.locator('id=delayed-lazy-hash')).toHaveText('#section1');

  // Hash-only navigation should create a navigation transaction
  expect(navigationEvent.transaction).toBe('/delayed-lazy/:id');
  expect(navigationEvent.contexts?.trace?.op).toBe('navigation');
  expect(navigationEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
  expect(navigationEvent.contexts?.trace?.status).toBe('ok');
});

test('Creates separate navigation transactions for multiple hash changes', async ({ page }) => {
  await page.goto('/delayed-lazy/123');

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();

  // First hash change: /delayed-lazy/123 -> /delayed-lazy/123#section1
  const firstNavigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/delayed-lazy/:id'
    );
  });

  const firstHashLink = page.locator('id=link-to-hash-section1');
  await expect(firstHashLink).toBeVisible();
  await firstHashLink.click();

  const firstNavigationEvent = await firstNavigationPromise;
  const firstTraceId = firstNavigationEvent.contexts?.trace?.trace_id;

  await expect(page.locator('id=delayed-lazy-hash')).toHaveText('#section1');

  // Second hash change: /delayed-lazy/123#section1 -> /delayed-lazy/123#section2
  const secondNavigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/delayed-lazy/:id' &&
      transactionEvent.contexts?.trace?.trace_id !== firstTraceId
    );
  });

  const secondHashLink = page.locator('id=link-to-hash-section2');
  await expect(secondHashLink).toBeVisible();
  await secondHashLink.click();

  const secondNavigationEvent = await secondNavigationPromise;
  const secondTraceId = secondNavigationEvent.contexts?.trace?.trace_id;

  await expect(page.locator('id=delayed-lazy-hash')).toHaveText('#section2');

  // Both navigations should have created separate transactions
  expect(firstNavigationEvent.transaction).toBe('/delayed-lazy/:id');
  expect(firstNavigationEvent.contexts?.trace?.op).toBe('navigation');
  expect(secondNavigationEvent.transaction).toBe('/delayed-lazy/:id');
  expect(secondNavigationEvent.contexts?.trace?.op).toBe('navigation');

  // Trace IDs should be different (separate transactions)
  expect(firstTraceId).toBeDefined();
  expect(secondTraceId).toBeDefined();
  expect(firstTraceId).not.toBe(secondTraceId);
});

test('Creates navigation transaction when changing both query and hash on same route', async ({ page }) => {
  await page.goto('/delayed-lazy/123?view=list');

  const delayedReady = page.locator('id=delayed-lazy-ready');
  await expect(delayedReady).toBeVisible();
  await expect(page.locator('id=delayed-lazy-view')).toHaveText('View: list');

  // Navigate from /delayed-lazy/123?view=list to /delayed-lazy/123?view=grid#results
  // This changes both query and hash
  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/delayed-lazy/:id'
    );
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
  expect(navigationEvent.transaction).toBe('/delayed-lazy/:id');
  expect(navigationEvent.contexts?.trace?.op).toBe('navigation');
  expect(navigationEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
  expect(navigationEvent.contexts?.trace?.status).toBe('ok');
});

test('Creates navigation transaction with correct name for slow lazy route', async ({ page }) => {
  // This test verifies that navigating to a slow lazy route (with top-level await)
  // creates a correctly named navigation transaction.
  // The route uses handle.lazyChildren with a 500ms delay.

  await page.goto('/');

  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/slow-fetch/:id'
    );
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
  expect(navigationEvent.transaction).toBe('/slow-fetch/:id');
  expect(navigationEvent.contexts?.trace?.op).toBe('navigation');
  expect(navigationEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Rapid navigation does not corrupt transaction names when lazy handlers resolve late', async ({ page }) => {
  await page.goto('/');

  const allTransactions: Array<{ name: string; op: string }> = [];

  const collectorPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (transactionEvent?.transaction && transactionEvent.contexts?.trace?.op) {
      allTransactions.push({
        name: transactionEvent.transaction,
        op: transactionEvent.contexts.trace.op,
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

test('Correctly names pageload transaction for slow lazy route with fetch', async ({ page }) => {
  // This test verifies that a slow lazy route (with top-level await and fetch)
  // creates a correctly named pageload transaction

  const pageloadPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/slow-fetch/:id'
    );
  });

  await page.goto('/slow-fetch/123');

  const pageloadEvent = await pageloadPromise;

  // Wait for the component to render (after the 500ms delay)
  const slowFetchContent = page.locator('id=slow-fetch-content');
  await expect(slowFetchContent).toBeVisible({ timeout: 5000 });
  await expect(page.locator('id=slow-fetch-id')).toHaveText('ID: 123');

  // Verify the transaction has the correct parameterized route name
  expect(pageloadEvent.transaction).toBe('/slow-fetch/:id');
  expect(pageloadEvent.contexts?.trace?.op).toBe('pageload');
  expect(pageloadEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');

  // Verify the transaction contains a fetch span
  const spans = pageloadEvent.spans || [];
  const fetchSpan = spans.find(
    (span: { op?: string; description?: string }) =>
      span.op === 'http.client' && span.description?.includes('/api/slow-data'),
  );

  // The fetch span should exist (even if the fetch failed, the span is created)
  expect(fetchSpan).toBeDefined();
});

test('Three-route rapid navigation preserves distinct transaction names', async ({ page }) => {
  const navigationTransactions: Array<{ name: string }> = [];

  const navigationCollector = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (transactionEvent.contexts?.trace?.op === 'navigation') {
      navigationTransactions.push({ name: transactionEvent.transaction || '' });
    }
    return false;
  });

  const pageloadPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/delayed-lazy/:id'
    );
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

test('Zero-wait rapid navigation does not corrupt transaction names', async ({ page }) => {
  const navigationTransactions: Array<{ name: string }> = [];

  const collector = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (transactionEvent.contexts?.trace?.op === 'navigation') {
      navigationTransactions.push({ name: transactionEvent.transaction || '' });
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

  const collector = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (transactionEvent?.transaction && transactionEvent.contexts?.trace?.op) {
      allTransactions.push({
        name: transactionEvent.transaction,
        op: transactionEvent.contexts.trace.op,
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

  const collector = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (transactionEvent.contexts?.trace?.op === 'navigation') {
      navigationTransactions.push({ name: transactionEvent.transaction || '' });
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

test('Query/hash navigation does not corrupt transaction name', async ({ page }) => {
  const navigationTransactions: Array<{ name: string }> = [];

  const collectorPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation') {
      navigationTransactions.push({ name: transactionEvent.transaction });
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
  const transactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      (transactionEvent.transaction?.startsWith('/slow-fetch') ?? false)
    );
  });

  // idleTimeout=300 ends span before 500ms lazy route loads, timeout=1000 waits for lazy routes
  await page.goto('/slow-fetch/123?idleTimeout=300&timeout=1000');

  const event = await transactionPromise;

  expect(event.transaction).toBe('/slow-fetch/:id');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('pageload');
  expect(event.contexts?.trace?.data?.['sentry.source']).toBe('route');

  const idleSpanFinishReason = event.contexts?.trace?.data?.['sentry.idle_span_finish_reason'];
  expect(['idleTimeout', 'externalFinish']).toContain(idleSpanFinishReason);
});

// Regression: Wildcard route names should be upgraded to parameterized routes when lazy routes load
test('Wildcard route pageload gets upgraded to parameterized route name (regression)', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      (transactionEvent.transaction?.startsWith('/wildcard-lazy') ?? false)
    );
  });

  await page.goto('/wildcard-lazy/456?idleTimeout=300&timeout=1000');

  const event = await transactionPromise;

  expect(event.transaction).toBe('/wildcard-lazy/:id');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('pageload');
  expect(event.contexts?.trace?.data?.['sentry.source']).toBe('route');
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

  const navigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      (transactionEvent.transaction?.startsWith('/wildcard-lazy') ?? false)
    );
  });

  // Navigate to wildcard-lazy route (500ms delay in module via top-level await)
  // The dynamic import creates network activity that extends the span lifetime
  const wildcardLazyLink = page.locator('id=navigation-to-wildcard-lazy');
  await expect(wildcardLazyLink).toBeVisible();
  await wildcardLazyLink.click();

  const event = await navigationPromise;

  // The navigation transaction should have the parameterized route name
  expect(event.transaction).toBe('/wildcard-lazy/:id');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('navigation');
  expect(event.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Captured navigation context is used instead of stale window.location during rapid navigation', async ({
  page,
}) => {
  // Validates fix for race condition where captureCurrentLocation would use stale WINDOW.location.
  // Navigate to slow route, then quickly to another route before lazy handler resolves.
  await page.goto('/');

  const allNavigationTransactions: Array<{ name: string; traceId: string }> = [];

  const collectorPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation') {
      allNavigationTransactions.push({
        name: transactionEvent.transaction,
        traceId: transactionEvent.contexts.trace.trace_id || '',
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
  // Without fix: second transaction gets wrong name and/or contains leaked spans.

  await page.goto('/');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allNavigationTransactions: Array<{ name: string; traceId: string; spans: any[] }> = [];

  const collectorPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    if (transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation') {
      allNavigationTransactions.push({
        name: transactionEvent.transaction,
        traceId: transactionEvent.contexts.trace.trace_id || '',
        spans: transactionEvent.spans || [],
      });
    }
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

  // Wait for slow-fetch lazy handler to complete and transactions to be sent
  await page.waitForTimeout(2000);

  await Promise.race([
    collectorPromise,
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 3000)),
  ]).catch(() => {});

  expect(allNavigationTransactions.length).toBeGreaterThanOrEqual(1);

  // /another-lazy transaction must have correct name, not "/slow-fetch/:id"
  const anotherLazyTransaction = allNavigationTransactions.find(t => t.name.startsWith('/another-lazy/sub'));
  expect(anotherLazyTransaction).toBeDefined();

  // Key assertion 2: /another-lazy transaction must NOT contain spans from /slow-fetch route
  // The /api/slow-data fetch is triggered by the slow-fetch route's lazy loading
  if (anotherLazyTransaction) {
    const leakedSpans = anotherLazyTransaction.spans.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (span: any) => span.description?.includes('slow-data') || span.data?.url?.includes('slow-data'),
    );
    expect(leakedSpans.length).toBe(0);
  }

  // Key assertion 3: If slow-fetch transaction exists, verify it has the correct name
  // (not corrupted to /another-lazy)
  const slowFetchTransaction = allNavigationTransactions.find(t => t.name.includes('slow-fetch'));
  if (slowFetchTransaction) {
    expect(slowFetchTransaction.name).toMatch(/\/slow-fetch/);
    // Verify slow-fetch transaction doesn't contain spans that belong to /another-lazy
    const wrongSpans = slowFetchTransaction.spans.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (span: any) => span.description?.includes('another-lazy') || span.data?.url?.includes('another-lazy'),
    );
    expect(wrongSpans.length).toBe(0);
  }
});
