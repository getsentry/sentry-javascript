import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should handle Firefox permission denial gracefully and still create measure spans',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    // Find all measure spans
    const measureSpans = eventData.spans?.filter(({ op }) => op === 'measure');
    expect(measureSpans?.length).toBe(2); // Both measures should create spans

    // Test 1: Verify the firefox-test-measure span exists but has no detail
    const firefoxMeasure = measureSpans?.find(span => span.description === 'firefox-test-measure');
    expect(firefoxMeasure).toBeDefined();
    expect(firefoxMeasure?.data).toMatchObject({
      'sentry.op': 'measure',
      'sentry.origin': 'auto.resource.browser.metrics',
    });

    // Verify no detail attributes were added due to the permission error
    const firefoxDataKeys = Object.keys(firefoxMeasure?.data || {});
    const firefoxDetailKeys = firefoxDataKeys.filter(key => key.includes('detail'));
    expect(firefoxDetailKeys).toHaveLength(0);

    // Test 2: Verify the normal measure still captures detail correctly
    const normalMeasure = measureSpans?.find(span => span.description === 'normal-measure');
    expect(normalMeasure).toBeDefined();
    expect(normalMeasure?.data).toMatchObject({
      'sentry.browser.measure.detail': 'this-should-work',
      'sentry.op': 'measure',
      'sentry.origin': 'auto.resource.browser.metrics',
    });
  },
);
