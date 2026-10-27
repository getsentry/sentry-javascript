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
  'starting a navigation span cancels the pageload span even if `enableReportPageLoaded` is true',
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
      [SENTRY_IDLE_SPAN_FINISH_REASON]: { type: 'string', value: 'cancelled' },
    });

    // The navigation starts 1s after init, but init itself can run well after the time origin on slow CI machines.
    // Calling `reportPageLoaded()` would only end the span after 2.5s.
    expect(spanDurationSeconds).toBeLessThan(2.5);
  },
);
