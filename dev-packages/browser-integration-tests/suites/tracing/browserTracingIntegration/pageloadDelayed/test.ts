import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should create a pageload transaction when initialized delayed', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const timeOrigin = await page.evaluate<number>('window._testBaseTimestamp');
  const timeoutTimestamp = await page.evaluate<number>('window._testTimeoutTimestamp');

  const { start_timestamp: startTimestamp } = eventData;

  expect(startTimestamp).toBeCloseTo(timeOrigin, 1);
  expect(startTimestamp).toBeLessThan(timeoutTimestamp);

  expect(eventData.contexts?.trace?.op).toBe('pageload');
  expect(eventData.spans?.length).toBeGreaterThan(0);
  expect(eventData.transaction_info?.source).toEqual('url');
});
