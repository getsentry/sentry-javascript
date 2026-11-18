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
    const initTimestamp = await page.evaluate<number>('window._testInitTimestamp');
    const secondsFromInitToSpanEnd = eventData.timestamp! - initTimestamp;

    expect(traceContextData).toMatchObject({
      [SENTRY_ORIGIN]: 'auto.pageload.browser',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
      [SENTRY_OP]: 'pageload',
      [SENTRY_IDLE_SPAN_FINISH_REASON]: 'finalTimeout',
    });

    // The final timeout of 3 seconds starts at `Sentry.init()`. The span starts earlier, at the time origin.
    // the margins are to account for timing weirdness in CI to avoid flakes
    expect(secondsFromInitToSpanEnd).toBeGreaterThan(2.5);
    expect(secondsFromInitToSpanEnd).toBeLessThan(3.5);
  },
);
