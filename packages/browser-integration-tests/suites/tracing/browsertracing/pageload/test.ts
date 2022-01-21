import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryTransactionRequest } from '../../../../utils/helpers';

sentryTest('should create a pageload transaction', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryTransactionRequest(page, url);

  expect(eventData.contexts?.trace?.op).toBe('pageload');
  expect(eventData.spans?.length).toBeGreaterThan(0);
});
