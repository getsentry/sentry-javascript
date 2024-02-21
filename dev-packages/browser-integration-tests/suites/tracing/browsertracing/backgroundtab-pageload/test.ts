import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should finish pageload transaction when the page goes background', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await page.locator('#go-background').click();

  const pageloadTransaction = await getFirstSentryEnvelopeRequest<Event>(page);

  expect(pageloadTransaction.contexts?.trace?.op).toBe('pageload');
  expect(pageloadTransaction.contexts?.trace?.status).toBe('cancelled');
  expect(pageloadTransaction.contexts?.trace?.data?.['sentry.cancellation_reason']).toBe('document.hidden');
});
