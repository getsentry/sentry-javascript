import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryTransactionRequest } from '../../../../utils/helpers';

sentryTest('should create a navigation transaction on page navigation', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  // This is the `pageload` transaction
  await getSentryTransactionRequest(page, url);

  const navigationRequest = await getSentryTransactionRequest(page, `${url}#foo`);

  expect(navigationRequest.contexts?.trace.op).toBe('navigation');
});
