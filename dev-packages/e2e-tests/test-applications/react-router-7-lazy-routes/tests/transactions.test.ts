import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a navigation transaction for lazy route', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    console.debug('Lazy route transaction event', transactionEvent);
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.goto('/');
  await page.locator('id=navigation').click();

  const event = await transactionPromise;

  expect(event.transaction).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('navigation');
});
