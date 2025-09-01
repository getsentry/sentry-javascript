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

test('Creates navigation transactions from inner lazy route to another lazy route', async ({ page }) => {
  // First, navigate to the inner lazy route
  const firstTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goto('/');

  // Navigate to inner lazy route first
  const navigationToInner = page.locator('id=navigation');
  await expect(navigationToInner).toBeVisible();
  await navigationToInner.click();

  const firstEvent = await firstTransactionPromise;

  // Check if the inner lazy route content is rendered
  const innerLazyContent = page.locator('id=innermost-lazy-route');
  await expect(innerLazyContent).toBeVisible();

  // Validate the first transaction event
  expect(firstEvent.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(firstEvent.type).toBe('transaction');
  expect(firstEvent.contexts?.trace?.op).toBe('navigation');

  // Now navigate from the inner lazy route to another lazy route
  const secondTransactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/another-lazy/sub/:id/:subId'
    );
  });

  // Click the navigation link from within the inner lazy route to another lazy route
  const navigationToAnotherFromInner = page.locator('id=navigate-to-another-from-inner');
  await expect(navigationToAnotherFromInner).toBeVisible();
  await navigationToAnotherFromInner.click();

  const secondEvent = await secondTransactionPromise;

  // Check if the another lazy route content is rendered
  const anotherLazyContent = page.locator('id=another-lazy-route-deep');
  await expect(anotherLazyContent).toBeVisible();

  // Validate the second transaction event
  expect(secondEvent.transaction).toBe('/another-lazy/sub/:id/:subId');
  expect(secondEvent.type).toBe('transaction');
  expect(secondEvent.contexts?.trace?.op).toBe('navigation');
});
