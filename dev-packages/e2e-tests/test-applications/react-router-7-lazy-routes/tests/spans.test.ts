import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { setTestUser, getStartedNavigationSpanCount } from './helpers';

test.beforeEach(setTestUser);

test('Creates a pageload span but no navigation span on initial load to deep lazy route', async ({
  page,
}, testInfo) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'pageload' &&
      span.is_segment &&
      span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
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

  expect(await getStartedNavigationSpanCount(page)).toBe(0);
});

test('Creates a navigation span inside a lazy route', async ({ page }, testInfo) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
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

test('Creates navigation spans between two different lazy routes', async ({ page }, testInfo) => {
  // Set up transaction listeners for both navigations
  const firstTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/another-lazy/sub/:id/:subId'
    );
  });

  const secondTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
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
}, testInfo) => {
  await page.goto('/');

  // Navigate to inner lazy route first
  const navigationToInner = page.locator('id=navigation');
  await expect(navigationToInner).toBeVisible();

  // First, navigate to the inner lazy route
  const firstTransactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
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
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/another-lazy/sub/:id/:subId'
    );
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
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
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
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/lazy/inner/:id/:anotherId'
    );
  });

  const navigationToUpper = page.locator('id=navigate-to-upper');

  await navigationToUpper.click();

  const goUpperRouteEvent = await goUpperRouteTransactionPromise;

  // Validate the go upper route transaction event
  expect(goUpperRouteEvent.name).toBe('/lazy/inner/:id/:anotherId');
  expect(goUpperRouteEvent.is_segment).toBe(true);
  expect(getSpanOp(goUpperRouteEvent)).toBe('navigation');
});

test('Does not send any duplicate navigation span names browsing between different routes', async ({
  page,
}, testInfo) => {
  const transactionNamesList: string[] = [];

  // Monitor and add all transaction names sent to Sentry for the navigations
  const allTransactionsPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    if (span.attributes['user.id']?.value !== testInfo.testId) {
      return false;
    }

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

test('Does not create premature navigation span during long-running lazy route pageload', async ({
  page,
}, testInfo) => {
  const pageloadPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'pageload' &&
      span.is_segment &&
      span.name === '/long-running/slow/:id'
    );
  });

  await page.goto('/long-running/slow/12345');

  const pageloadEvent = await pageloadPromise;

  expect(pageloadEvent.name).toBe('/long-running/slow/:id');
  expect(getSpanOp(pageloadEvent)).toBe('pageload');

  const slowLoadingContent = page.locator('id=slow-loading-content');
  await expect(slowLoadingContent).toBeVisible({ timeout: 5000 });

  expect(await getStartedNavigationSpanCount(page)).toBe(0);
});

test('Allows legitimate POP navigation (back/forward) after pageload completes', async ({ page }, testInfo) => {
  await page.goto('/');

  const navigationToLongRunning = page.locator('id=navigation-to-long-running');
  await expect(navigationToLongRunning).toBeVisible();

  // Set up transaction listeners for both navigations
  const firstNavigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/long-running/slow/:id'
    );
  });

  const backNavigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/'
    );
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

test('Creates pageload span with parameterized route for delayed lazy route', async ({ page }, testInfo) => {
  const pageloadPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'pageload' &&
      span.is_segment &&
      span.name === '/delayed-lazy/:id'
    );
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

test('Creates navigation span with correct name for slow lazy route', async ({ page }, testInfo) => {
  // This test verifies that navigating to a slow lazy route (with top-level await)
  // creates a correctly named navigation transaction.
  // The route uses handle.lazyChildren with a 500ms delay.

  await page.goto('/');

  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.name === '/slow-fetch/:id'
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
  expect(navigationEvent.name).toBe('/slow-fetch/:id');
  expect(getSpanOp(navigationEvent)).toBe('navigation');
  expect(navigationEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
});
