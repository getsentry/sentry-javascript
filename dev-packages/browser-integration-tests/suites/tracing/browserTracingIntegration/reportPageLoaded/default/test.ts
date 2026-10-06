import { SENTRY_SEGMENT_NAME_SOURCE, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/browser';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  'waits for Sentry.reportPageLoaded() to be called when `enableReportPageLoaded` is true',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const pageloadEventPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const eventData = envelopeRequestParser(await pageloadEventPromise);

    const traceContextData = eventData.contexts?.trace?.data;
    const spanDurationSeconds = eventData.timestamp! - eventData.start_timestamp!;

    expect(traceContextData).toMatchObject({
      [SENTRY_ORIGIN]: 'auto.pageload.browser',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
      [SENTRY_OP]: 'pageload',
      ['sentry.idle_span_finish_reason']: 'reportPageLoaded',
    });

    // We wait for 2.5 seconds before calling Sentry.reportPageLoaded(). The span starts at navigation start,
    // but the timeout only starts once the bundle has executed, so allow generous upper headroom for slow CI.
    expect(spanDurationSeconds).toBeGreaterThan(2);
    expect(spanDurationSeconds).toBeLessThan(4);
  },
);
