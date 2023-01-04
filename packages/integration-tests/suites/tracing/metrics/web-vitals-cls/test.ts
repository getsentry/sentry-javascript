import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

sentryTest('should capture a "GOOD" CLS vital with its source(s).', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#0.05`);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeCloseTo(0.05);
  expect(eventData.tags?.['cls.source.1']).toBe('body > div#content > p#partial');
});

sentryTest('should capture a "MEH" CLS vital with its source(s).', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#0.21`);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeCloseTo(0.21);
  expect(eventData.tags?.['cls.source.1']).toBe('body > div#content > p');
});

sentryTest('should capture a "POOR" CLS vital with its source(s).', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#0.35`);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeDefined();
  // This test in particular seems to be flaky, such that the received value is frequently within 0.006 rather than the
  // 0.005 that `toBeCloseTo()` requires. While it's true that each test is retried twice if it fails, in the flaky
  // cases all three attempts always seem to come up with the exact same slightly-too-far-away number. Rather than ramp
  // down `toBeCloseTo()`'s precision (which would make it accept anything between 0.30 and 0.40), we can just do the
  // check manually.
  expect(eventData.measurements?.cls?.value).toBeGreaterThan(0.34);
  expect(eventData.measurements?.cls?.value).toBeLessThan(0.36);
  expect(eventData.tags?.['cls.source.1']).toBe('body > div#content > p');
});
