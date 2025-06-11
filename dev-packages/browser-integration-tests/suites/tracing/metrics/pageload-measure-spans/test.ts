import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

// Validation test for https://github.com/getsentry/sentry-javascript/issues/12281
sentryTest('should add browser-related spans to pageload transaction', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const browserSpans = eventData.spans?.filter(({ op }) => op?.startsWith('browser'));

  // Spans `domContentLoadedEvent`, `connect`, `cache` and `DNS` are not
  // always inside `pageload` transaction.
  expect(browserSpans?.length).toBeGreaterThanOrEqual(4);

  const requestSpan = browserSpans!.find(({ op }) => op === 'browser.request');
  expect(requestSpan).toBeDefined();
  expect(requestSpan?.description).toBe(page.url());

  // Find all measure spans
  const measureSpans = eventData.spans?.filter(({ op }) => op === 'measure');
  expect(measureSpans?.length).toBe(3); // We created 3 measures in init.js

  // Test 1: Verify object detail is captured
  const nextJsMeasure = measureSpans?.find(span => span.description === 'Next.js-before-hydration');
  expect(nextJsMeasure).toBeDefined();
  expect(nextJsMeasure?.data).toMatchObject({
    'sentry.browser.measure_happened_before_request': true,
    'sentry.browser.measure_start_time': expect.any(Number),
    'sentry.browser.measure.detail.component': 'HomePage',
    'sentry.browser.measure.detail.renderTime': 123.45,
    'sentry.browser.measure.detail.isSSR': true,
    'sentry.op': 'measure',
    'sentry.origin': 'auto.resource.browser.metrics',
  });

  // Test 2: Verify primitive detail is captured
  const customMetricMeasure = measureSpans?.find(span => span.description === 'custom-metric');
  expect(customMetricMeasure).toBeDefined();
  expect(customMetricMeasure?.data).toMatchObject({
    'sentry.browser.measure.detail': 'simple-string-detail',
    'sentry.op': 'measure',
    'sentry.origin': 'auto.resource.browser.metrics',
  });

  // Test 3: Verify complex detail is stringified
  const complexMeasure = measureSpans?.find(span => span.description === 'complex-measure');
  expect(complexMeasure).toBeDefined();
  expect(complexMeasure?.data).toMatchObject({
    'sentry.browser.measure.detail.nested': '{"value":"test","array":[1,2,3]}',
    'sentry.op': 'measure',
    'sentry.origin': 'auto.resource.browser.metrics',
  });

  expect(requestSpan!.start_timestamp).toBeLessThanOrEqual(nextJsMeasure!.start_timestamp);
});
