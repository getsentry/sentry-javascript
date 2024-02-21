import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';

sentryTest('should handle custom added browserTracingIntegration instances', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForTransactionRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);
  const timeOrigin = await page.evaluate<number>('window._testBaseTimestamp');

  const { start_timestamp: startTimestamp } = eventData;

  expect(startTimestamp).toBeCloseTo(timeOrigin, 1);

  expect(eventData.contexts?.trace?.op).toBe('pageload');
  expect(eventData.spans?.length).toBeGreaterThan(0);
  expect(eventData.transaction_info?.source).toEqual('url');
});
