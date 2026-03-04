import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/browser';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest(
  'final timeout cancels the pageload span even if `enableReportPageLoaded` is true',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

    await page.goto(url);

    const pageloadSpan = await pageloadSpanPromise;

    const spanDurationSeconds = pageloadSpan.end_timestamp - pageloadSpan.start_timestamp;

    expect(pageloadSpan.attributes).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.pageload.browser' },
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: expect.objectContaining({ value: 1 }),
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: { type: 'string', value: 'url' },
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'pageload' },
      'sentry.idle_span_finish_reason': { type: 'string', value: 'finalTimeout' },
    });

    // We wait for 3 seconds before calling Sentry.reportPageLoaded()
    // the margins are to account for timing weirdness in CI to avoid flakes
    expect(spanDurationSeconds).toBeGreaterThan(2.5);
    expect(spanDurationSeconds).toBeLessThan(3.5);
  },
);
