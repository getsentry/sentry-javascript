import { expect } from '@playwright/test';
import {
  extractTraceparentData,
  parseBaggageHeader,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE,
} from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  eventAndTraceHeaderRequestParser,
  shouldSkipTracingTest,
  waitForTracingHeadersOnUrl,
  waitForTransactionRequest,
} from '../../../../../../utils/helpers';

sentryTest.describe('When `consistentTraceSampling` is `true`', () => {
  sentryTest('Continues sampling decision from initial pageload', async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const { pageloadTraceContext, pageloadSampleRand } = await sentryTest.step('Initial pageload', async () => {
      const pageloadRequestPromise = waitForTransactionRequest(page, evt => {
        return evt.contexts?.trace?.op === 'pageload';
      });
      await page.goto(url);

      const res = eventAndTraceHeaderRequestParser(await pageloadRequestPromise);
      const pageloadSampleRand = Number(res[1]?.sample_rand);
      const pageloadTraceContext = res[0].contexts?.trace;

      expect(pageloadTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toBe(1);
      expect(pageloadSampleRand).toBeGreaterThanOrEqual(0);

      return { pageloadTraceContext: res[0].contexts?.trace, pageloadSampleRand };
    });

    const customTraceContext = await sentryTest.step('Custom trace', async () => {
      const customTrace1RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'custom');
      await page.locator('#btn1').click();
      const [customTrace1Event, customTraceTraceHeader] = eventAndTraceHeaderRequestParser(
        await customTrace1RequestPromise,
      );

      const customTraceContext = customTrace1Event.contexts?.trace;

      expect(customTraceContext?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);
      // although we "continue the trace" from pageload, this is actually a root span,
      // so there must not be a parent span id
      expect(customTraceContext?.parent_span_id).toBeUndefined();

      expect(pageloadSampleRand).toEqual(Number(customTraceTraceHeader?.sample_rand));

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
      const navTraceContext = navigationEvent.contexts?.trace;

      expect(navTraceContext?.trace_id).not.toEqual(customTraceContext?.trace_id);
      expect(navTraceContext?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);

      expect(navTraceContext?.links).toEqual([
        {
          trace_id: customTraceContext?.trace_id,
          span_id: customTraceContext?.span_id,
          sampled: true,
          attributes: {
            [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
          },
        },
      ]);
      expect(navTraceContext?.parent_span_id).toBeUndefined();

      expect(pageloadSampleRand).toEqual(Number(navigationTraceHeader?.sample_rand));
    });
  });

  sentryTest('Propagates continued sampling decision to outgoing requests', async ({ page, getLocalTestUrl }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const { pageloadTraceContext, pageloadSampleRand } = await sentryTest.step('Initial pageload', async () => {
      const pageloadRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
      await page.goto(url);

      const res = eventAndTraceHeaderRequestParser(await pageloadRequestPromise);
      const pageloadSampleRand = Number(res[1]?.sample_rand);

      expect(pageloadSampleRand).toBeGreaterThanOrEqual(0);

      const pageloadTraceContext = res[0].contexts?.trace;

      expect(pageloadTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toBe(1);

      return { pageloadTraceContext: pageloadTraceContext, pageloadSampleRand };
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

      expect(fetchTraceSampleRand).toEqual(pageloadSampleRand);

      expect(fetchTraceTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toEqual(
        pageloadTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE],
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
        'sentry-sample_rand': `${pageloadSampleRand}`,
        'sentry-sample_rate': '1',
        'sentry-sampled': 'true',
        'sentry-trace_id': fetchTraceTraceContext?.trace_id,
        'sentry-transaction': 'custom root span 2',
      });
    });
  });
});
