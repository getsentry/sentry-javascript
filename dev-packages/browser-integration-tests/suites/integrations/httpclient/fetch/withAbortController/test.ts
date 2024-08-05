import { expect } from '@playwright/test';
import type { Event as SentryEvent } from '@sentry/types';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('should handle aborted fetch calls', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.route('**/foo', async () => {
    // never fulfil this route because we abort the request as part of the test
  });

  const transactionEventPromise = getFirstSentryEnvelopeRequest<SentryEvent>(page);

  let hasPrintedFetchAborted = false;
  page.on('console', msg => {
    if (msg.type() === 'log' && msg.text() === 'Fetch aborted') {
      hasPrintedFetchAborted = true;
    }
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
  expect(hasPrintedFetchAborted).toBe(true);
});
