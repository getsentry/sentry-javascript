import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest(
  'waits for Sentry.reportPageLoaded() to be called when `enableReportPageLoaded` is true',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

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
      [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: { type: 'string', value: 'reportPageLoaded' },
    });

    // We wait for 2.5 seconds before calling Sentry.reportPageLoaded()
    // the margins are to account for timing weirdness in CI to avoid flakes
    expect(spanDurationSeconds).toBeGreaterThan(2);
    expect(spanDurationSeconds).toBeLessThan(3);
  },
);
