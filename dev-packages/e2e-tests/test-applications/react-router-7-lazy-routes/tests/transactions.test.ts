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
  // First, navigate to the "another-lazy" route
  const firstTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/another-lazy/sub/:id/:subId'
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
  const secondTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

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
  page.waitForTimeout(1000);

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

  const firstNavigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/long-running/slow/:id'
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
  const backNavigationPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/'
    );
  });

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

  // First navigation: / -> /lazy/inner/:id/:anotherId/:someAnotherId
  const firstTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  const navigationToInner = page.locator('id=navigation');
  await expect(navigationToInner).toBeVisible();
  await navigationToInner.click();

  const firstEvent = await firstTransactionPromise;

  // Verify first transaction
  expect(firstEvent.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(firstEvent.contexts?.trace?.op).toBe('navigation');
  expect(firstEvent.contexts?.trace?.status).toBe('ok');

  const firstTraceId = firstEvent.contexts?.trace?.trace_id;
  const firstSpanId = firstEvent.contexts?.trace?.span_id;

  // Second navigation: /lazy/inner -> /another-lazy/sub/:id/:subId
  const secondTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/another-lazy/sub/:id/:subId'
    );
  });

  const navigationToAnother = page.locator('id=navigate-to-another-from-inner');
  await expect(navigationToAnother).toBeVisible();
  await navigationToAnother.click();

  const secondEvent = await secondTransactionPromise;

  // Verify second transaction
  expect(secondEvent.transaction).toBe('/another-lazy/sub/:id/:subId');
  expect(secondEvent.contexts?.trace?.op).toBe('navigation');
  expect(secondEvent.contexts?.trace?.status).toBe('ok');

  const secondTraceId = secondEvent.contexts?.trace?.trace_id;
  const secondSpanId = secondEvent.contexts?.trace?.span_id;

  // Third navigation: /another-lazy -> /lazy/inner/:id/:anotherId/:someAnotherId (back to same route as first)
  const thirdTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId' &&
      // Ensure we're not matching the first transaction again
      transactionEvent.contexts?.trace?.trace_id !== firstTraceId
    );
  });

  const navigationBackToInner = page.locator('id=navigate-to-inner-from-deep');
  await expect(navigationBackToInner).toBeVisible();
  await navigationBackToInner.click();

  const thirdEvent = await thirdTransactionPromise;

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
