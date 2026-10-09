import { SENTRY_SEGMENT_ID } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest('creates a pageload span based on `sentry-trace` <meta>', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const url = await getLocalTestUrl({ testDir: __dirname });
  const spans = collectStreamedSpans(page);
  const [pageload] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);
  await page.evaluate(() => (window as any).Sentry.flush());
  expect(getSpanOp(pageload)).toBe('pageload');
  expect(pageload).toMatchObject({
    is_segment: true,
    parent_span_id: '1121201211212012',
    trace_id: '12312012123120121231201212312012',
  });
  expect(spans.filter(span => !span.is_segment)).not.toHaveLength(0);
});

sentryTest(
  'propagates `baggage` <meta> in the span envelope without adding own data',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());
    const url = await getLocalTestUrl({ testDir: __dirname });
    const [, trace] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);
    expect(trace).toEqual({
      release: '2.1.12',
      sample_rate: '0.3232',
      trace_id: '123',
      public_key: 'public',
      sample_rand: '0.42',
    });
  },
);

sentryTest("creates a navigation that's not influenced by `sentry-trace` <meta>", async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const url = await getLocalTestUrl({ testDir: __dirname });
  const spans = collectStreamedSpans(page);
  const [pageload] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);
  const [navigation] = await waitForStreamedSpanAndTraceHeaderOnUrl(
    page,
    `${url}#foo`,
    span => getSpanOp(span) === 'navigation',
  );
  await page.evaluate(() => (window as any).Sentry.flush());

  expect(getSpanOp(pageload)).toBe('pageload');
  expect(pageload).toMatchObject({
    parent_span_id: '1121201211212012',
    trace_id: '12312012123120121231201212312012',
  });
  expect(getSpanOp(navigation)).toBe('navigation');
  expect(navigation.trace_id).toBeDefined();
  expect(navigation.trace_id).not.toBe(pageload.trace_id);
  expect(pageload.span_id).toBeDefined();
  expect(navigation.span_id).toBeDefined();
  for (const root of [pageload, navigation]) {
    spans
      .filter(span => !span.is_segment && span.attributes[SENTRY_SEGMENT_ID]?.value === root.span_id)
      .forEach(span => expect(span.parent_span_id).toBe(root.span_id));
  }
});
