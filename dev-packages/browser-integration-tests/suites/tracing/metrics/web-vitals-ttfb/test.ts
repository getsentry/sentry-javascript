import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture TTFB vital.', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.ttfb?.value).toBeDefined();
  expect(eventData.measurements?.ttfb?.value).toBeGreaterThan(0);
  expect(eventData.measurements?.['ttfb.requestTime']?.value).toBeDefined();
  expect(eventData.measurements?.['ttfb.requestTime']?.value).toBeGreaterThan(0);
});
