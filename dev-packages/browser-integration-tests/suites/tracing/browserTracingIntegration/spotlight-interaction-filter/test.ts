import { expect } from '@playwright/test';
import type { Event as SentryEvent } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipCdnBundleTest,
  shouldSkipTracingTest,
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
    await getFirstSentryEnvelopeRequest<SentryEvent>(page);

    // Click on the spotlight element — interaction span should be filtered
    const spotlightEnvelopePromise = getMultipleSentryEnvelopeRequests<SentryEvent>(page, 1);
    await page.locator('[data-test-id=spotlight-button]').click();
    await page.locator('.clicked[data-test-id=spotlight-button]').isVisible();
    const [spotlightTransaction] = await spotlightEnvelopePromise;

    expect(spotlightTransaction.type).toBe('transaction');
    expect(spotlightTransaction.contexts?.trace?.op).toBe('ui.action.click');

    const spotlightInteractionSpans = spotlightTransaction.spans?.filter(span => span.op === 'ui.interaction.click');
    expect(spotlightInteractionSpans).toHaveLength(0);

    // Click on the regular button — interaction span should be kept
    const regularEnvelopePromise = getMultipleSentryEnvelopeRequests<SentryEvent>(page, 1);
    await page.locator('[data-test-id=regular-button]').click();
    await page.locator('.clicked[data-test-id=regular-button]').isVisible();
    const [regularTransaction] = await regularEnvelopePromise;

    expect(regularTransaction.type).toBe('transaction');
    expect(regularTransaction.contexts?.trace?.op).toBe('ui.action.click');

    const regularInteractionSpans = regularTransaction.spans?.filter(span => span.op === 'ui.interaction.click');
    expect(regularInteractionSpans?.length).toBeGreaterThanOrEqual(1);
    expect(regularInteractionSpans![0]!.description).toContain('button');
    expect(regularInteractionSpans![0]!.description).not.toContain('#sentry-spotlight');
  },
);
