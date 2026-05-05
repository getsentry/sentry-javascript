import { expect } from '@playwright/test';
import type { TransactionEvent } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipCdnBundleTest,
  shouldSkipTracingTest,
  waitForTransactionRequest,
} from '../../../../utils/helpers';

sentryTest(
  'filters ui.interaction.click spans for spotlight elements via ignoreSpans',
  async ({ getLocalTestUrl, page }) => {
    // spotlightBrowserIntegration is not available in CDN bundles
    if (shouldSkipTracingTest() || shouldSkipCdnBundleTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    // Wait for the pageload transaction to complete
    await waitForTransactionRequest(page);

    // Click on the spotlight element — interaction span should be filtered
    const spotlightTxnPromise = waitForTransactionRequest(page, txn => txn.contexts?.trace?.op === 'ui.action.click');
    await page.locator('[data-test-id=spotlight-button]').click();
    await page.locator('.clicked[data-test-id=spotlight-button]').isVisible();
    const spotlightTransaction = envelopeRequestParser<TransactionEvent>(await spotlightTxnPromise);

    expect(spotlightTransaction.contexts?.trace?.op).toBe('ui.action.click');

    const spotlightInteractionSpans = spotlightTransaction.spans?.filter(span => span.op === 'ui.interaction.click');
    expect(spotlightInteractionSpans).toHaveLength(0);

    // Let the first idle span fully settle before clicking again
    await page.waitForTimeout(1000);

    // Click on the regular button — wait specifically for a transaction that contains
    // a ui.interaction.click child span, since the PerformanceObserver may deliver
    // the event entry asynchronously
    const regularTxnPromise = waitForTransactionRequest(
      page,
      txn =>
        txn.contexts?.trace?.op === 'ui.action.click' &&
        (txn.spans?.some(span => span.op === 'ui.interaction.click') ?? false),
    );
    await page.locator('[data-test-id=regular-button]').click();
    await page.locator('.clicked[data-test-id=regular-button]').isVisible();
    const regularTransaction = envelopeRequestParser<TransactionEvent>(await regularTxnPromise);

    const regularInteractionSpans = regularTransaction.spans?.filter(span => span.op === 'ui.interaction.click');
    expect(regularInteractionSpans?.length).toBeGreaterThanOrEqual(1);
    expect(regularInteractionSpans![0]!.description).toContain('button');
    expect(regularInteractionSpans![0]!.description).not.toContain('#sentry-spotlight');
  },
);
