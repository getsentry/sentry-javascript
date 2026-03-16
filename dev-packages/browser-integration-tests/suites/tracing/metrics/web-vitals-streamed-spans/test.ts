import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { getSpanOp, getSpansFromEnvelope, waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

sentryTest.beforeEach(async ({ browserName }) => {
  if (shouldSkipTracingTest() || testingCdnBundle() || browserName !== 'chromium') {
    sentryTest.skip();
  }
});

sentryTest('captures FCP as a streamed span with duration from navigation start', async ({ getLocalTestUrl, page }) => {
  const fcpSpanEnvelopePromise = waitForStreamedSpanEnvelope(page, env => {
    const spans = getSpansFromEnvelope(env);
    return spans.some(s => getSpanOp(s) === 'ui.webvital.fcp');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const fcpEnvelope = await fcpSpanEnvelopePromise;
  const fcpSpan = getSpansFromEnvelope(fcpEnvelope).find(s => getSpanOp(s) === 'ui.webvital.fcp')!;

  expect(fcpSpan).toBeDefined();
  expect(fcpSpan.attributes?.['sentry.op']).toEqual({ type: 'string', value: 'ui.webvital.fcp' });
  expect(fcpSpan.attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.fcp' });
  expect(fcpSpan.attributes?.['sentry.exclusive_time']).toEqual({ type: 'integer', value: 0 });
  expect(fcpSpan.attributes?.['user_agent.original']?.value).toEqual(expect.stringContaining('Chrome'));
  expect(fcpSpan.name).toBe('FCP');
  expect(fcpSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(fcpSpan.trace_id).toMatch(/^[\da-f]{32}$/);

  // Span should have meaningful duration (navigation start -> FCP event)
  expect(fcpSpan.end_timestamp).toBeGreaterThan(fcpSpan.start_timestamp);
});

sentryTest('captures FP as a streamed span with duration from navigation start', async ({ getLocalTestUrl, page }) => {
  const fpSpanEnvelopePromise = waitForStreamedSpanEnvelope(page, env => {
    const spans = getSpansFromEnvelope(env);
    return spans.some(s => getSpanOp(s) === 'ui.webvital.fp');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const fpEnvelope = await fpSpanEnvelopePromise;
  const fpSpan = getSpansFromEnvelope(fpEnvelope).find(s => getSpanOp(s) === 'ui.webvital.fp')!;

  expect(fpSpan).toBeDefined();
  expect(fpSpan.attributes?.['sentry.op']).toEqual({ type: 'string', value: 'ui.webvital.fp' });
  expect(fpSpan.attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.fp' });
  expect(fpSpan.attributes?.['sentry.exclusive_time']).toEqual({ type: 'integer', value: 0 });
  expect(fpSpan.name).toBe('FP');
  expect(fpSpan.span_id).toMatch(/^[\da-f]{16}$/);

  // Span should have meaningful duration (navigation start -> FP event)
  expect(fpSpan.end_timestamp).toBeGreaterThan(fpSpan.start_timestamp);
});

sentryTest(
  'captures TTFB as a streamed span with duration from navigation start',
  async ({ getLocalTestUrl, page }) => {
    const ttfbSpanEnvelopePromise = waitForStreamedSpanEnvelope(page, env => {
      const spans = getSpansFromEnvelope(env);
      return spans.some(s => getSpanOp(s) === 'ui.webvital.ttfb');
    });

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const ttfbEnvelope = await ttfbSpanEnvelopePromise;
    const ttfbSpan = getSpansFromEnvelope(ttfbEnvelope).find(s => getSpanOp(s) === 'ui.webvital.ttfb')!;

    expect(ttfbSpan).toBeDefined();
    expect(ttfbSpan.attributes?.['sentry.op']).toEqual({ type: 'string', value: 'ui.webvital.ttfb' });
    expect(ttfbSpan.attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.ttfb' });
    expect(ttfbSpan.attributes?.['sentry.exclusive_time']).toEqual({ type: 'integer', value: 0 });
    expect(ttfbSpan.name).toBe('TTFB');
    expect(ttfbSpan.span_id).toMatch(/^[\da-f]{16}$/);

    // Span should have meaningful duration (navigation start -> first byte)
    expect(ttfbSpan.end_timestamp).toBeGreaterThan(ttfbSpan.start_timestamp);
  },
);
