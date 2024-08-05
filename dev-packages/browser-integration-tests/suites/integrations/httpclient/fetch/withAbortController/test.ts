import { expect } from '@playwright/test';
import type { Event as SentryEvent } from '@sentry/types';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('should handle aborted fetch calls', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.route('**/foo', async route => {
    setTimeout(() => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'This is the server response' }),
      });
    }, 2000);
  });

  await page.goto(url);

  await page.locator('[data-test-id=start-button]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-test-id=abort-button]').click();
  const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page);

  // assert that fetch calls do not return undefined
  const fetchBreadcrumbs = eventData.breadcrumbs?.filter(
    ({ category, data }) => category === 'fetch' && data === undefined,
  );
  expect(fetchBreadcrumbs).toHaveLength(0);

  // assert that fetch call has been aborted
  const abortedBreadcrumb = eventData.breadcrumbs?.filter(
    ({ category, message }) => category === 'console' && message === 'Fetch aborted',
  );
  expect(abortedBreadcrumb).toHaveLength(1);
});
