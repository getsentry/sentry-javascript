import { SENTRY_IDLE_SPAN_FINISH_REASON } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest('should send a pageload span terminated via child span timeout', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const spans = collectStreamedSpans(page);
  const [pageloadSpan] = await waitForStreamedSpanAndTraceHeaderOnUrl(
    page,
    url,
    span => getSpanOp(span) === 'pageload',
  );
  await page.evaluate(() => (window as any).Sentry.flush());

  expect(getSpanOp(pageloadSpan)).toBe('pageload');
  expect(pageloadSpan.attributes['sentry.idle_span_discarded_spans']).toBeUndefined();
  expect(spans.length).toBeGreaterThanOrEqual(1);
  const testSpan = spans.find(span => span.name === 'pageload-child-span');
  expect(testSpan).toBeDefined();
  expect(testSpan?.status).toBe('ok');
  expect(pageloadSpan.attributes[SENTRY_IDLE_SPAN_FINISH_REASON]?.value).toBe('heartbeatFailed');
  expect(testSpan).toMatchObject({
    parent_span_id: pageloadSpan.span_id,
    trace_id: pageloadSpan.trace_id,
    end_timestamp: pageloadSpan.end_timestamp,
  });
});
