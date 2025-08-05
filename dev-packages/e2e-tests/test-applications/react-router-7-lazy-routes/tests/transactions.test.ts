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
