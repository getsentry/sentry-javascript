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
  'final timeout cancels the pageload span even if `enableReportPageLoaded` is true',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

    await page.goto(url);

    const pageloadSpan = await pageloadSpanPromise;

    const initTimestamp = await page.evaluate<number>('window._testInitTimestamp');
    const secondsFromInitToSpanEnd = pageloadSpan.end_timestamp - initTimestamp;

    expect(pageloadSpan.attributes).toMatchObject({
      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.pageload.browser' },
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: expect.objectContaining({ value: 1 }),
      [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'url' },
      [SENTRY_OP]: { type: 'string', value: 'pageload' },
      [SENTRY_IDLE_SPAN_FINISH_REASON]: { type: 'string', value: 'finalTimeout' },
    });

    // The final timeout of 3 seconds starts at `Sentry.init()`. The span starts earlier, at the time origin.
    // the margins are to account for timing weirdness in CI to avoid flakes
    expect(secondsFromInitToSpanEnd).toBeGreaterThan(2.5);
    expect(secondsFromInitToSpanEnd).toBeLessThan(3.5);
  },
);
