import { PAGELOAD, UI_ACTION_CLICK, UI_INTERACTION_CLICK } from '@sentry/conventions/op';
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
    const pageloadPromise = waitForTransactionRequest(page, txn => txn.contexts?.trace?.op === PAGELOAD);
    await page.goto(url);
    await pageloadPromise;

    // Click on the spotlight element — interaction span should be filtered
    const spotlightTxnPromise = waitForTransactionRequest(page, txn => txn.contexts?.trace?.op === UI_ACTION_CLICK);
    await page.locator('[data-test-id=spotlight-button]').click();
    await page.locator('.clicked[data-test-id=spotlight-button]').isVisible();
    const spotlightTransaction = envelopeRequestParser<TransactionEvent>(await spotlightTxnPromise);

    expect(spotlightTransaction.contexts?.trace?.op).toBe(UI_ACTION_CLICK);

    const spotlightInteractionSpans = spotlightTransaction.spans?.filter(span => span.op === UI_INTERACTION_CLICK);
    expect(spotlightInteractionSpans).toHaveLength(0);

    // Click on the regular button — wait specifically for a transaction that contains
    // a ui.interaction.click child span, since the PerformanceObserver may deliver
    // the event entry asynchronously
    const regularTxnPromise = waitForTransactionRequest(
      page,
      txn =>
        txn.contexts?.trace?.op === UI_ACTION_CLICK &&
        (txn.spans?.some(span => span.op === UI_INTERACTION_CLICK) ?? false),
    );
    await page.locator('[data-test-id=regular-button]').click();
    await page.locator('.clicked[data-test-id=regular-button]').isVisible();
    const regularTransaction = envelopeRequestParser<TransactionEvent>(await regularTxnPromise);

    const regularInteractionSpans = regularTransaction.spans?.filter(span => span.op === UI_INTERACTION_CLICK);
    expect(regularInteractionSpans?.length).toBeGreaterThanOrEqual(1);
    expect(regularInteractionSpans![0]!.description).toContain('button');
    expect(regularInteractionSpans![0]!.description).not.toContain('#sentry-spotlight');
  },
);
