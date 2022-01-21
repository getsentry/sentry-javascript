import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryTransactionRequest } from '../../../../utils/helpers';

sentryTest('should capture TTFB vital.', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getSentryTransactionRequest(page, url);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.ttfb?.value).toBeDefined();
  expect(eventData.measurements?.['ttfb.requestTime']?.value).toBeDefined();
});
