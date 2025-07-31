import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should capture pageload transaction for lazy route', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-6', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/lazy/inner-lazy/inner'
    );
  });

  // Navigate to a lazy-loaded route - try just /lazy first
  await page.goto('/lazy');

  // Debug: Check what's actually rendered on the page
  const pageContent = await page.content();
  console.log('Page content for /lazy:', pageContent);

  // Check if any content is rendered - use a more general selector
  await page.waitForLoadState('networkidle');
  const bodyContent = await page.locator('body').innerHTML();
  console.log('Body content:', bodyContent);

  // Try to navigate to the full nested path
  await page.goto('/lazy/inner-lazy/inner');
  await page.waitForLoadState('networkidle');

  const nestedPageContent = await page.content();
  console.log('Nested page content:', nestedPageContent);

  const event = await transactionPromise;

  expect(event.transaction).toBe('/lazy/inner-lazy');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('pageload');
});
