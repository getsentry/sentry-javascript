import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/browser';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  'starting a navigation span cancels the pageload span even if `enableReportPageLoaded` is true',
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
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      ['sentry.idle_span_finish_reason']: 'cancelled',
    });

    // ending span after 1s but adding a margin of 0.5s to account for timing weirdness in CI to avoid flakes
    expect(spanDurationSeconds).toBeLessThan(1.5);
  },
);
