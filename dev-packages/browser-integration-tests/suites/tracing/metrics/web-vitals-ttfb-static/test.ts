import { PAGELOAD } from '@sentry/conventions/op';
import { TTFB_REQUESTTIME } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest('should capture TTFB vital.', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const pageloadPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === PAGELOAD);
  await page.goto(url);
  const eventData = envelopeRequestParser<Event>(await pageloadPromise);

  expect(eventData.measurements).toBeDefined();

  // If responseStart === 0, ttfb is not reported
  // This seems to happen somewhat randomly, so we just ignore this in that case
  const responseStart = await page.evaluate("performance.getEntriesByType('navigation')[0].responseStart;");
  if (responseStart !== 0) {
    expect(eventData.measurements?.ttfb?.value).toBeDefined();
  }

  expect(eventData.measurements?.[TTFB_REQUESTTIME]?.value).toBeDefined();
});
