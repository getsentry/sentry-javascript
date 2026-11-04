import { expect } from '@playwright/test';
import {
  extractTraceparentData,
  parseBaggageHeader,
  SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  eventAndTraceHeaderRequestParser,
  shouldSkipTracingTest,
  waitForTracingHeadersOnUrl,
  waitForTransactionRequest,
} from '../../../../../../utils/helpers';

const metaTagSampleRand = 0.051121;
const metaTagSampleRate = 0.2;

sentryTest.describe('When `consistentTraceSampling` is `true` and page contains <meta> tags', () => {
  sentryTest('Continues sampling decision across all traces from meta tag', async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadTraceContext = await sentryTest.step('Initial pageload', async () => {
      const pageloadRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');

      await page.goto(url);

      const [pageloadEvent, pageloadTraceHeader] = eventAndTraceHeaderRequestParser(await pageloadRequestPromise);
      const pageloadTraceContext = pageloadEvent.contexts?.trace;

      expect(Number(pageloadTraceHeader?.sample_rand)).toBe(metaTagSampleRand);
      expect(Number(pageloadTraceHeader?.sample_rate)).toBe(metaTagSampleRate);

      // since the local sample rate was not applied, the sample rate attribute shouldn't be set
      expect(pageloadTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toBeUndefined();
      expect(pageloadTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]).toBeUndefined();

      return pageloadTraceContext;
    });

    const customTraceContext = await sentryTest.step('Custom trace', async () => {
      const customTrace1RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'custom');

      await page.locator('#btn1').click();

      const [customTrace1Event, customTraceTraceHeader] = eventAndTraceHeaderRequestParser(
        await customTrace1RequestPromise,
      );

      const customTraceContext = customTrace1Event.contexts?.trace;

      expect(customTraceContext?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);
      expect(customTraceContext?.parent_span_id).toBeUndefined();

      expect(Number(customTraceTraceHeader?.sample_rand)).toBe(metaTagSampleRand);
      expect(Number(customTraceTraceHeader?.sample_rate)).toBe(metaTagSampleRate);
      expect(Boolean(customTraceTraceHeader?.sampled)).toBe(true);

      // since the local sample rate was not applied, the sample rate attribute shouldn't be set
      expect(customTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toBeUndefined();

      // but we need to set this attribute to still be able to correctly add the sample rate to the DSC (checked above in trace header)
      expect(customTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]).toBe(metaTagSampleRate);

      return customTraceContext;
    });

    await sentryTest.step('Navigation', async () => {
      const navigation1RequestPromise = waitForTransactionRequest(
        page,
        evt => evt.contexts?.trace?.op === 'navigation',
      );

      await page.goto(`${url}#foo`);

      const [navigationEvent, navigationTraceHeader] = eventAndTraceHeaderRequestParser(
        await navigation1RequestPromise,
      );

      const navigationTraceContext = navigationEvent.contexts?.trace;

      expect(navigationTraceContext?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);
      expect(navigationTraceContext?.trace_id).not.toEqual(customTraceContext?.trace_id);

      expect(navigationTraceContext?.parent_span_id).toBeUndefined();

      expect(Number(navigationTraceHeader?.sample_rand)).toEqual(metaTagSampleRand);
      expect(Number(navigationTraceHeader?.sample_rate)).toEqual(metaTagSampleRate);
      expect(Boolean(navigationTraceHeader?.sampled)).toEqual(true);

      // since the local sample rate was not applied, the sample rate attribute shouldn't be set
      expect(navigationTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toBeUndefined();

      // but we need to set this attribute to still be able to correctly add the sample rate to the DSC (checked above in trace header)
      expect(navigationTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]).toBe(
        metaTagSampleRate,
      );
    });
  });

  sentryTest(
    'Propagates continued <meta> tag sampling decision to outgoing requests',
    async ({ page, getLocalTestUrl }) => {
      if (shouldSkipTracingTest()) {
        sentryTest.skip();
      }

      const url = await getLocalTestUrl({ testDir: __dirname });

      const pageloadTraceContext = await sentryTest.step('Initial pageload', async () => {
        const pageloadRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');

        await page.goto(url);

        const [pageloadEvent, pageloadTraceHeader] = eventAndTraceHeaderRequestParser(await pageloadRequestPromise);
        const pageloadTraceContext = pageloadEvent.contexts?.trace;

        expect(Number(pageloadTraceHeader?.sample_rand)).toBe(metaTagSampleRand);
        expect(Number(pageloadTraceHeader?.sample_rate)).toBe(metaTagSampleRate);

        // since the local sample rate was not applied, the sample rate attribute shouldn't be set
        expect(pageloadTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toBeUndefined();
        expect(pageloadTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]).toBeUndefined();

        return pageloadTraceContext;
      });

      await sentryTest.step('Make fetch request', async () => {
        const fetchTracePromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'custom');
        const tracingHeadersPromise = waitForTracingHeadersOnUrl(page, 'http://sentry-test-external.io');

        await page.locator('#btn2').click();

        const { baggage, sentryTrace } = await tracingHeadersPromise;

        const [fetchTraceEvent, fetchTraceTraceHeader] = eventAndTraceHeaderRequestParser(await fetchTracePromise);

        const fetchTraceSampleRand = Number(fetchTraceTraceHeader?.sample_rand);
        const fetchTraceTraceContext = fetchTraceEvent.contexts?.trace;
        const httpClientSpan = fetchTraceEvent.spans?.find(span => span.op === 'http.client');

        expect(fetchTraceSampleRand).toEqual(metaTagSampleRand);

        expect(fetchTraceTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toBeUndefined();
        expect(fetchTraceTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]).toBe(
          metaTagSampleRate,
        );

        expect(fetchTraceTraceContext?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);

        expect(sentryTrace).toBeDefined();
        expect(baggage).toBeDefined();

        expect(extractTraceparentData(sentryTrace)).toEqual({
          traceId: fetchTraceTraceContext?.trace_id,
          parentSpanId: httpClientSpan?.span_id,
          parentSampled: true,
        });

        expect(parseBaggageHeader(baggage)).toEqual({
          'sentry-environment': 'production',
          'sentry-public_key': 'public',
          'sentry-sample_rand': `${metaTagSampleRand}`,
          'sentry-sample_rate': `${metaTagSampleRate}`,
          'sentry-sampled': 'true',
          'sentry-trace_id': fetchTraceTraceContext?.trace_id,
          'sentry-transaction': 'custom root span 2',
        });
      });
    },
  );
});
