import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('clamps pre-SDK measures to the document request start', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  const pageload = await pageloadPromise;
  await page.evaluate(() => (window as any).Sentry.flush());

  const browserSpans = spans.filter(span => getSpanOp(span)?.startsWith('browser'));
  expect(browserSpans.length).toBeGreaterThanOrEqual(4);
  const request = browserSpans.find(span => getSpanOp(span) === 'browser.request')!;
  expect(request.name).toBe('Request');
  expect(request.attributes['url.full']).toEqual({ type: 'string', value: page.url() });
  const measures = spans.filter(span => getSpanOp(span) === 'measure');
  expect(measures).toHaveLength(1);
  const measure = measures[0];
  expect(measure.parent_span_id).toBe(pageload.span_id);
  expect(request.start_timestamp).toBeLessThanOrEqual(measure.start_timestamp);
  expect(measure.attributes).toMatchObject({
    'sentry.browser.measure_happened_before_request': { type: 'boolean', value: true },
    'sentry.browser.measure_start_time': {
      type: expect.stringMatching(/^(double|integer)$/),
      value: expect.any(Number),
    },
    'sentry.op': { type: 'string', value: 'measure' },
    'sentry.origin': { type: 'string', value: 'auto.browser.user_timing.measure' },
  });
});
