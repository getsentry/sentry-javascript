import { expect } from '@playwright/test';
import type { Event as SentryEvent } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../../utils/helpers';

sentryTest('should handle aborted fetch calls', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('**/foo', async () => {
    // never fulfil this route because we abort the request as part of the test
  });

  const transactionEventPromise = getFirstSentryEnvelopeRequest<SentryEvent>(page);

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

  const transactionEvent = await transactionEventPromise;

  // assert that fetch calls do not return undefined
  const fetchBreadcrumbs = transactionEvent.breadcrumbs?.filter(
    ({ category, data }) => category === 'fetch' && data === undefined,
  );
  expect(fetchBreadcrumbs).toHaveLength(0);

  await expect(hasAbortedFetchPromise).resolves.toBeUndefined();
});
