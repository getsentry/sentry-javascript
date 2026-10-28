import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForErrorRequest } from '../../../../../utils/helpers';
import { waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest('should handle aborted fetch calls', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('**/foo', async () => {
    // never fulfil this route because we abort the request as part of the test
  });

  const spanPromise = waitForStreamedSpan(page, span => span.name === 'with-abort-controller');

  const hasAbortedFetchPromise = new Promise<void>(resolve => {
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text() === 'Fetch aborted') {
        resolve();
      }
    });
  });

  await page.goto(url);

  await page.locator('[data-test-id=start-button]').click();
  await page.locator('[data-test-id=abort-button]').click();

  await spanPromise;
  const eventPromise = waitForErrorRequest(page);
  await page.evaluate(() => (window as any).Sentry.captureMessage('After aborted fetch'));
  const event = envelopeRequestParser(await eventPromise);

  // assert that fetch calls do not return undefined
  const fetchBreadcrumbs = event.breadcrumbs?.filter(
    ({ category, data }) => category === 'fetch' && data === undefined,
  );
  expect(fetchBreadcrumbs).toHaveLength(0);

  await expect(hasAbortedFetchPromise).resolves.toBeUndefined();
});
