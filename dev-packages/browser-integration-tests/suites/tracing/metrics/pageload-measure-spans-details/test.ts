import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture measure detail as span attributes', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  const measureSpan = eventData.spans?.find(({ op }) => op === 'measure');
  expect(measureSpan).toBeDefined();
  expect(measureSpan?.description).toBe('test-measure');

  // Verify detail was captured
  expect(measureSpan?.data).toMatchObject({
    'sentry.browser.measure.detail.foo': 'bar',
    'sentry.op': 'measure',
    'sentry.origin': 'auto.resource.browser.metrics',
  });
});
