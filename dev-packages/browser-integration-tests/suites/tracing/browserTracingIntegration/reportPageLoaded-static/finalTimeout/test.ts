import {
  SENTRY_IDLE_SPAN_FINISH_REASON,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/browser';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  'final timeout cancels the pageload span even if `enableReportPageLoaded` is true',
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
      [SENTRY_IDLE_SPAN_FINISH_REASON]: 'finalTimeout',
    });

    // We wait for 3 seconds before calling Sentry.reportPageLoaded()
    // the margins are to account for timing weirdness in CI to avoid flakes
    expect(spanDurationSeconds).toBeGreaterThan(2.5);
    expect(spanDurationSeconds).toBeLessThan(3.5);
  },
);
