import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture FP vital.', async ({ browserName, getLocalTestUrl, page }) => {
  // FP is not generated on webkit or firefox
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.contexts?.trace?.data?.['browser.web_vital.fp.value']).toBeGreaterThan(0);

  const fpSpan = eventData.spans?.filter(({ description }) => description === 'first-paint')[0];

  expect(fpSpan).toBeDefined();
  expect(fpSpan?.op).toBe('paint');
  expect(fpSpan?.parent_span_id).toBe(eventData.contexts?.trace?.span_id);
});

sentryTest('should capture FCP vital.', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.contexts?.trace?.data?.['browser.web_vital.fcp.value']).toBeGreaterThan(0);

  const fcpSpan = eventData.spans?.filter(({ description }) => description === 'first-contentful-paint')[0];

  expect(fcpSpan).toBeDefined();
  expect(fcpSpan?.op).toBe('paint');
  expect(fcpSpan?.parent_span_id).toBe(eventData.contexts?.trace?.span_id);
});
