import { URL_FULL } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('adds browser performance spans to the pageload segment', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  const pageload = await pageloadPromise;
  await page.evaluate(() => (window as any).Sentry.flush());

  const browserSpans = spans.filter(span => getSpanOp(span)?.startsWith('browser'));
  expect(browserSpans.length).toBeGreaterThanOrEqual(4);
  [
    { op: 'browser.load_event', name: 'Load event' },
    { op: 'browser.request', name: 'Request' },
    { op: 'browser.response', name: 'Response' },
  ].forEach(({ op, name }) => {
    const matches = browserSpans.filter(span => getSpanOp(span) === op);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe(name);
    expect(matches[0].attributes[URL_FULL]).toEqual({ type: 'string', value: page.url() });
    expect(matches[0].parent_span_id).toBe(pageload.span_id);
    expect(matches[0].trace_id).toBe(pageload.trace_id);
  });
});
