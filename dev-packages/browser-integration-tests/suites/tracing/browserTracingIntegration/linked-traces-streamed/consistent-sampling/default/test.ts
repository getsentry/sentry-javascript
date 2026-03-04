import { expect } from '@playwright/test';
import { extractTraceparentData, parseBaggageHeader, SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle, waitForTracingHeadersOnUrl } from '../../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpanEnvelope } from '../../../../../../utils/spanUtils';

sentryTest.describe('When `consistentTraceSampling` is `true`', () => {
  sentryTest('continues sampling decision from initial pageload span', async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

    const url = await getLocalTestUrl({ testDir: __dirname });

    const { pageloadSpan, pageloadSampleRand } = await sentryTest.step('Initial pageload', async () => {
      const pageloadEnvelopePromise = waitForStreamedSpanEnvelope(
        page,
        env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'pageload'),
      );
      await page.goto(url);

      const envelope = await pageloadEnvelopePromise;
      const pageloadSampleRand = Number(envelope[0].trace?.sample_rand);
      const pageloadSpan = envelope[1][0][1].items.find(s => getSpanOp(s) === 'pageload')!;

      expect(pageloadSpan.attributes?.['sentry.sample_rate']?.value).toBe(1);
      expect(Number.isNaN(pageloadSampleRand)).toBe(false);
      expect(pageloadSampleRand).toBeGreaterThanOrEqual(0);
      expect(pageloadSampleRand).toBeLessThanOrEqual(1);

      return { pageloadSpan, pageloadSampleRand };
    });

    const customTraceSpan = await sentryTest.step('Custom trace', async () => {
      const customEnvelopePromise = waitForStreamedSpanEnvelope(
        page,
        env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'custom'),
      );
      await page.locator('#btn1').click();
      const envelope = await customEnvelopePromise;
      const span = envelope[1][0][1].items.find(s => getSpanOp(s) === 'custom')!;

      expect(span.trace_id).not.toEqual(pageloadSpan.trace_id);
      // although we "continue the trace" from pageload, this is actually a root span,
      // so there must not be a parent span id
      expect(span.parent_span_id).toBeUndefined();

      expect(Number(envelope[0].trace?.sample_rand)).toBe(pageloadSampleRand);

      return span;
    });

    await sentryTest.step('Navigation', async () => {
      const navigationEnvelopePromise = waitForStreamedSpanEnvelope(
        page,
        env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'navigation'),
      );
      await page.goto(`${url}#foo`);
      const envelope = await navigationEnvelopePromise;
      const navSpan = envelope[1][0][1].items.find(s => getSpanOp(s) === 'navigation')!;

      expect(navSpan.trace_id).not.toEqual(customTraceSpan.trace_id);
      expect(navSpan.trace_id).not.toEqual(pageloadSpan.trace_id);

      expect(navSpan.links).toEqual([
        {
          trace_id: customTraceSpan.trace_id,
          span_id: customTraceSpan.span_id,
          sampled: true,
          attributes: {
            [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: {
              type: 'string',
              value: 'previous_trace',
            },
          },
        },
      ]);
      expect(navSpan.parent_span_id).toBeUndefined();

      expect(Number(envelope[0].trace?.sample_rand)).toBe(pageloadSampleRand);
    });
  });

  sentryTest('Propagates continued sampling decision to outgoing requests', async ({ page, getLocalTestUrl }) => {
    sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

    const url = await getLocalTestUrl({ testDir: __dirname });

    const { pageloadSpan, pageloadSampleRand } = await sentryTest.step('Initial pageload', async () => {
      const pageloadEnvelopePromise = waitForStreamedSpanEnvelope(
        page,
        env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'pageload'),
      );
      await page.goto(url);

      const envelope = await pageloadEnvelopePromise;
      const pageloadSampleRand = Number(envelope[0].trace?.sample_rand);

      expect(Number(envelope[0].trace?.sample_rand)).toBe(pageloadSampleRand);
      expect(pageloadSampleRand).toBeGreaterThanOrEqual(0);
      expect(pageloadSampleRand).toBeLessThanOrEqual(1);
      expect(Number.isNaN(pageloadSampleRand)).toBe(false);

      const pageloadSpan = envelope[1][0][1].items.find(s => getSpanOp(s) === 'pageload')!;

      expect(pageloadSpan.attributes?.['sentry.sample_rate']?.value).toBe(1);

      return { pageloadSpan, pageloadSampleRand };
    });

    await sentryTest.step('Make fetch request', async () => {
      const fetchEnvelopePromise = waitForStreamedSpanEnvelope(
        page,
        env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'custom'),
      );
      const tracingHeadersPromise = waitForTracingHeadersOnUrl(page, 'http://sentry-test-external.io');

      await page.locator('#btn2').click();

      const { baggage, sentryTrace } = await tracingHeadersPromise;
      const fetchEnvelope = await fetchEnvelopePromise;

      const fetchTraceSampleRand = Number(fetchEnvelope[0].trace?.sample_rand);
      const fetchTraceSpans = fetchEnvelope[1][0][1].items;
      const fetchTraceSpan = fetchTraceSpans.find(s => getSpanOp(s) === 'custom')!;
      const httpClientSpan = fetchTraceSpans.find(s => getSpanOp(s) === 'http.client');

      expect(fetchTraceSampleRand).toBe(pageloadSampleRand);

      expect(fetchTraceSpan.attributes?.['sentry.sample_rate']?.value).toEqual(
        pageloadSpan.attributes?.['sentry.sample_rate']?.value,
      );
      expect(fetchTraceSpan.trace_id).not.toEqual(pageloadSpan.trace_id);

      expect(sentryTrace).toBeDefined();
      expect(baggage).toBeDefined();

      expect(extractTraceparentData(sentryTrace)).toEqual({
        traceId: fetchTraceSpan.trace_id,
        parentSpanId: httpClientSpan?.span_id,
        parentSampled: true,
      });

      expect(parseBaggageHeader(baggage)).toEqual({
        'sentry-environment': 'production',
        'sentry-public_key': 'public',
        'sentry-sample_rand': `${pageloadSampleRand}`,
        'sentry-sample_rate': '1',
        'sentry-sampled': 'true',
        'sentry-trace_id': fetchTraceSpan.trace_id,
        'sentry-transaction': 'custom root span 2',
      });
    });
  });
});
