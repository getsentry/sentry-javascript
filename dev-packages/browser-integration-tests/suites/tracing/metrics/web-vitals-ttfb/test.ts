import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture TTFB vital.', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.measurements).toBeDefined();

  // If responseStart === 0, ttfb is not reported
  // This seems to happen somewhat randomly, so we just ignore this in that case
  const responseStart = await page.evaluate("performance.getEntriesByType('navigation')[0].responseStart;");
  if (responseStart !== 0) {
    expect(eventData.measurements?.ttfb?.value).toBeDefined();
  }

  expect(eventData.measurements?.['ttfb.requestTime']?.value).toBeDefined();
});
