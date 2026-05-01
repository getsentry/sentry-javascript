import { expect } from '@playwright/test';
import {
  extractTraceparentData,
  parseBaggageHeader,
  SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE,
} from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import { shouldSkipTracingTest, waitForTracingHeadersOnUrl } from '../../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpanEnvelope } from '../../../../../../utils/spanUtils';

const metaTagSampleRand = 0.051121;
const metaTagSampleRate = 0.2;

sentryTest.describe('When `consistentTraceSampling` is `true` and page contains <meta> tags', () => {
  sentryTest('Continues sampling decision across all traces from meta tag', async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpan = await sentryTest.step('Initial pageload', async () => {
      const pageloadEnvelopePromise = waitForStreamedSpanEnvelope(
        page,
        env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'pageload'),
      );

      await page.goto(url);

      const envelope = await pageloadEnvelopePromise;
      const span = envelope[1][0][1].items.find(s => getSpanOp(s) === 'pageload')!;

      expect(Number(envelope[0].trace?.sample_rand)).toBe(metaTagSampleRand);
      expect(Number(envelope[0].trace?.sample_rate)).toBe(metaTagSampleRate);

      // since the local sample rate was not applied, the sample rate attribute shouldn't be set
      expect(span.attributes?.['sentry.sample_rate']).toBeUndefined();
      expect(span.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]).toBeUndefined();

      return span;
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
      expect(span.parent_span_id).toBeUndefined();

      expect(Number(envelope[0].trace?.sample_rand)).toBe(metaTagSampleRand);
      expect(Number(envelope[0].trace?.sample_rate)).toBe(metaTagSampleRate);
      expect(envelope[0].trace?.sampled).toBe('true');

      // since the local sample rate was not applied, the sample rate attribute shouldn't be set
      expect(span.attributes?.['sentry.sample_rate']).toBeUndefined();

      // but we need to set this attribute to still be able to correctly add the sample rate to the DSC (checked above in trace header)
      expect(span.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]?.value).toBe(metaTagSampleRate);

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

      expect(navSpan.trace_id).not.toEqual(pageloadSpan.trace_id);
      expect(navSpan.trace_id).not.toEqual(customTraceSpan.trace_id);

      expect(navSpan.parent_span_id).toBeUndefined();

      expect(Number(envelope[0].trace?.sample_rand)).toEqual(metaTagSampleRand);
      expect(Number(envelope[0].trace?.sample_rate)).toEqual(metaTagSampleRate);
      expect(envelope[0].trace?.sampled).toEqual('true');

      // since the local sample rate was not applied, the sample rate attribute shouldn't be set
      expect(navSpan.attributes?.['sentry.sample_rate']).toBeUndefined();

      // but we need to set this attribute to still be able to correctly add the sample rate to the DSC (checked above in trace header)
      expect(navSpan.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]?.value).toBe(metaTagSampleRate);
    });
  });

  sentryTest(
    'Propagates continued <meta> tag sampling decision to outgoing requests',
    async ({ page, getLocalTestUrl }) => {
      sentryTest.skip(shouldSkipTracingTest());

      const url = await getLocalTestUrl({ testDir: __dirname });

      const pageloadSpan = await sentryTest.step('Initial pageload', async () => {
        const pageloadEnvelopePromise = waitForStreamedSpanEnvelope(
          page,
          env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'pageload'),
        );

        await page.goto(url);

        const envelope = await pageloadEnvelopePromise;
        const span = envelope[1][0][1].items.find(s => getSpanOp(s) === 'pageload')!;

        expect(Number(envelope[0].trace?.sample_rand)).toBe(metaTagSampleRand);
        expect(Number(envelope[0].trace?.sample_rate)).toBe(metaTagSampleRate);

        // since the local sample rate was not applied, the sample rate attribute shouldn't be set
        expect(span.attributes?.['sentry.sample_rate']).toBeUndefined();
        expect(span.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]).toBeUndefined();

        return span;
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

        expect(fetchTraceSampleRand).toEqual(metaTagSampleRand);

        expect(fetchTraceSpan.attributes?.['sentry.sample_rate']).toBeUndefined();
        expect(fetchTraceSpan.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]?.value).toBe(
          metaTagSampleRate,
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
          'sentry-sample_rand': `${metaTagSampleRand}`,
          'sentry-sample_rate': `${metaTagSampleRate}`,
          'sentry-sampled': 'true',
          'sentry-trace_id': fetchTraceSpan.trace_id,
          'sentry-transaction': 'custom root span 2',
        });
      });
    },
  );
});
