import {
  SENTRY_IDLE_SPAN_FINISH_REASON,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/browser';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest(
  'waits for Sentry.reportPageLoaded() to be called when `enableReportPageLoaded` is true',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

    await page.goto(url);

    const pageloadSpan = await pageloadSpanPromise;

    const spanDurationSeconds = pageloadSpan.end_timestamp - pageloadSpan.start_timestamp;

    expect(pageloadSpan.attributes).toMatchObject({
      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.pageload.browser' },
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: expect.objectContaining({ value: 1 }),
      [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'url' },
      [SENTRY_OP]: { type: 'string', value: 'pageload' },
      [SENTRY_IDLE_SPAN_FINISH_REASON]: { type: 'string', value: 'reportPageLoaded' },
    });

    // We wait for 2.5 seconds before calling Sentry.reportPageLoaded(). The span starts at navigation start,
    // but the timeout only starts once the bundle has executed, so allow generous upper headroom for slow CI.
    expect(spanDurationSeconds).toBeGreaterThan(2);
    expect(spanDurationSeconds).toBeLessThan(4);
  },
);
