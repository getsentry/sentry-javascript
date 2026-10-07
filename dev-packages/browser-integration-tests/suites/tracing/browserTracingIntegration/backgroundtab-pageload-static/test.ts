import { PAGELOAD } from '@sentry/conventions/op';
import { SENTRY_CANCELLATION_REASON } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest('should finish pageload transaction when the page goes background', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }
  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === PAGELOAD);

  await page.goto(url);
  await page.locator('#go-background').click();

  const pageloadTransaction = envelopeRequestParser(await pageloadPromise);

  expect(pageloadTransaction.contexts?.trace?.op).toBe(PAGELOAD);
  expect(pageloadTransaction.contexts?.trace?.status).toBe('cancelled');
  expect(pageloadTransaction.contexts?.trace?.data?.[SENTRY_CANCELLATION_REASON]).toBe('document.hidden');
});
