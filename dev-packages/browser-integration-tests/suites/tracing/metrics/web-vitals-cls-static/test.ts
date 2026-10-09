import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

sentryTest('records CLS as a pageload measurement with its source', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#0.05`);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeDefined();

  // Flakey value dependent on timings -> we check for a range
  expect(eventData.measurements?.cls?.value).toBeGreaterThan(0.03);
  expect(eventData.measurements?.cls?.value).toBeLessThan(0.07);

  expect(eventData.contexts?.trace?.data?.['cls.source.1']).toBe('body > div#content > p#partial');
});
