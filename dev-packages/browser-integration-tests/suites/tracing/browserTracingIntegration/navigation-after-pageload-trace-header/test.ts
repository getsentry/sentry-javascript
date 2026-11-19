import { NAVIGATION, PAGELOAD } from '@sentry/conventions/op';
import { SENTRY_IDLE_SPAN_FINISH_REASON } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpanAndTraceHeader } from '../../../../utils/spanUtils';

sentryTest(
  "keeps the pageload's trace values in its trace envelope header when a new navigation trace starts before the pageload spans are flushed",
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadPromise = waitForStreamedSpanAndTraceHeader(page, span => getSpanOp(span) === PAGELOAD);
    const navigationPromise = waitForStreamedSpanAndTraceHeader(page, span => getSpanOp(span) === NAVIGATION);

    await page.goto(url);

    const [pageloadSpan, pageloadTraceHeader] = await pageloadPromise;
    const [navigationSpan, navigationTraceHeader] = await navigationPromise;

    const { pageloadSampleRand, scopeTraceIdOnPageloadFlush } = await page.evaluate(() => ({
      pageloadSampleRand: (window as any)._pageloadSampleRand,
      scopeTraceIdOnPageloadFlush: (window as any)._scopeTraceIdOnPageloadFlush,
    }));

    expect(pageloadSpan.trace_id).not.toEqual(navigationSpan.trace_id);
    expect(pageloadSpan.attributes[SENTRY_IDLE_SPAN_FINISH_REASON]?.value).toBe('reportPageLoaded');

    // The pageload span envelope was only sent after the navigation started its new trace on the scope
    expect(scopeTraceIdOnPageloadFlush).toBe(navigationSpan.trace_id);

    // The navigation resets the propagation context on the scope the pageload span captured.
    // The pageload envelope is flushed after that, but must still carry the pageload's values.
    expect(pageloadTraceHeader).toEqual({
      environment: 'production',
      public_key: 'public',
      trace_id: pageloadSpan.trace_id,
      sample_rate: '1',
      sampled: 'true',
      sample_rand: String(pageloadSampleRand),
    });

    expect(navigationTraceHeader).toMatchObject({
      trace_id: navigationSpan.trace_id,
      sampled: 'true',
    });

    expect(navigationTraceHeader?.sample_rand).not.toEqual(pageloadTraceHeader?.sample_rand);
  },
);
