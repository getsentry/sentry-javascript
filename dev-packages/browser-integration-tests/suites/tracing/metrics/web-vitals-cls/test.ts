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

function getClsAttrs(eventData: Event): Record<string, unknown> {
  const clsSpan = eventData.spans?.find(({ op }) => op === 'ui.webvital.cls');
  expect(clsSpan).toBeDefined();
  return clsSpan?.data ?? {};
}

sentryTest('should capture a "GOOD" CLS vital with its source(s).', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#0.05`);

  const clsAttrs = getClsAttrs(eventData);
  const clsValue = clsAttrs['browser.web_vital.cls.value'] as number;

  // Flakey value dependent on timings -> we check for a range
  expect(clsValue).toBeGreaterThan(0.03);
  expect(clsValue).toBeLessThan(0.07);

  expect(clsAttrs['browser.web_vital.cls.source.1']).toBe('body > div#content > p#partial');
});

sentryTest('should capture a "MEH" CLS vital with its source(s).', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#0.21`);

  const clsAttrs = getClsAttrs(eventData);
  const clsValue = clsAttrs['browser.web_vital.cls.value'] as number;

  // Flakey value dependent on timings -> we check for a range
  expect(clsValue).toBeGreaterThan(0.18);
  expect(clsValue).toBeLessThan(0.23);

  expect(clsAttrs['browser.web_vital.cls.source.1']).toBe('body > div#content > p');
});

sentryTest('should capture a "POOR" CLS vital with its source(s).', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#0.35`);

  const clsAttrs = getClsAttrs(eventData);
  const clsValue = clsAttrs['browser.web_vital.cls.value'] as number;

  // Flakey value dependent on timings -> we check for a range
  expect(clsValue).toBeGreaterThan(0.34);
  expect(clsValue).toBeLessThan(0.36);
  expect(clsAttrs['browser.web_vital.cls.source.1']).toBe('body > div#content > p');
});
