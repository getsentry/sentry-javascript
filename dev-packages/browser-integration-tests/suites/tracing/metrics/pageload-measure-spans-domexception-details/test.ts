import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

// This is a regression test for https://github.com/getsentry/sentry-javascript/issues/16347

sentryTest(
  'should handle permission denial gracefully and still create measure spans',
  async ({ getLocalTestUrl, page, browserName }) => {
    // Skip test on webkit because we can't validate the detail in the browser
    if (shouldSkipTracingTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    // Find all measure spans
    const measureSpans = eventData.spans?.filter(({ op }) => op === 'measure');
    expect(measureSpans?.length).toBe(3); // All three measures should create spans

    // Test 1: Verify the restricted-test-measure span exists but has no detail
    const restrictedMeasure = measureSpans?.find(span => span.description === 'restricted-test-measure');
    expect(restrictedMeasure).toBeDefined();
    expect(restrictedMeasure?.data).toMatchObject({
      'sentry.op': 'measure',
      'sentry.origin': 'auto.resource.browser.metrics',
    });

    // Verify no detail attributes were added due to the permission error
    const restrictedDataKeys = Object.keys(restrictedMeasure?.data || {});
    const restrictedDetailKeys = restrictedDataKeys.filter(key => key.includes('detail'));
    expect(restrictedDetailKeys).toHaveLength(0);

    // Test 2: Verify the normal measure still captures detail correctly
    const normalMeasure = measureSpans?.find(span => span.description === 'normal-measure');
    expect(normalMeasure).toBeDefined();
    expect(normalMeasure?.data).toMatchObject({
      'sentry.browser.measure.detail': 'this-should-work',
      'sentry.op': 'measure',
      'sentry.origin': 'auto.resource.browser.metrics',
    });

    // Test 3: Verify the complex detail object is captured correctly
    const complexMeasure = measureSpans?.find(span => span.description === 'complex-detail-measure');
    expect(complexMeasure).toBeDefined();
    expect(complexMeasure?.data).toMatchObject({
      'sentry.op': 'measure',
      'sentry.origin': 'auto.resource.browser.metrics',
      // The entire nested object is stringified as a single value
      'sentry.browser.measure.detail.nested': JSON.stringify({
        array: [1, 2, 3],
        object: {
          key: 'value',
        },
      }),
      'sentry.browser.measure.detail.metadata': JSON.stringify({
        type: 'test',
        version: '1.0',
        tags: ['complex', 'nested', 'object'],
      }),
    });
  },
);
