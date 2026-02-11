import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/browser';
import type { ClientReport } from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  eventAndTraceHeaderRequestParser,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
  waitForTransactionRequest,
} from '../../../../../../utils/helpers';

/**
 * This test demonstrates that:
 * - explicit sampling decisions in `tracesSampler` has precedence over consistent sampling
 * - despite consistentTraceSampling being activated, there are still a lot of cases where the trace chain can break
 */
sentryTest.describe('When `consistentTraceSampling` is `true`', () => {
  sentryTest('explicit sampling decisions in `tracesSampler` have precedence', async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const { pageloadTraceContext } = await sentryTest.step('Initial pageload', async () => {
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

    await sentryTest.step('Custom trace is sampled negatively (explicitly in tracesSampler)', async () => {
      const clientReportPromise = waitForClientReportRequest(page);

      await page.locator('#btn1').click();

      await page.waitForTimeout(500);
      await hidePage(page);

      const clientReport = envelopeRequestParser<ClientReport>(await clientReportPromise);

      expect(clientReport).toEqual({
        timestamp: expect.any(Number),
        discarded_events: [
          {
            category: 'transaction',
            quantity: 1,
            reason: 'sample_rate',
          },
        ],
      });
    });

    await sentryTest.step('Subsequent navigation trace is also sampled negatively', async () => {
      const clientReportPromise = waitForClientReportRequest(page);

      await page.goto(`${url}#foo`);

      await page.waitForTimeout(500);

      await hidePage(page);

      const clientReport = envelopeRequestParser<ClientReport>(await clientReportPromise);

      expect(clientReport).toEqual({
        timestamp: expect.any(Number),
        discarded_events: [
          {
            category: 'transaction',
            quantity: 1,
            reason: 'sample_rate',
          },
        ],
      });
    });

    const { customTrace2Context } = await sentryTest.step(
      'Custom trace 2 is sampled positively (explicitly in tracesSampler)',
      async () => {
        const customTrace2RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'custom');

        await page.locator('#btn2').click();

        const [customTrace2Event] = eventAndTraceHeaderRequestParser(await customTrace2RequestPromise);

        const customTrace2Context = customTrace2Event.contexts?.trace;

        expect(customTrace2Context?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toBe(1);
        expect(customTrace2Context?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);
        expect(customTrace2Context?.parent_span_id).toBeUndefined();

        expect(customTrace2Context?.links).toEqual([
          {
            attributes: { 'sentry.link.type': 'previous_trace' },
            sampled: false,
            span_id: expect.stringMatching(/^[\da-f]{16}$/),
            trace_id: expect.stringMatching(/^[\da-f]{32}$/),
          },
        ]);

        return { customTrace2Context };
      },
    );

    await sentryTest.step('Navigation trace is sampled positively (inherited from previous trace)', async () => {
      const navigationRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'navigation');

      await page.goto(`${url}#bar`);

      const [navigationEvent] = eventAndTraceHeaderRequestParser(await navigationRequestPromise);

      const navigationTraceContext = navigationEvent.contexts?.trace;

      expect(navigationTraceContext?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]).toBe(1);
      expect(navigationTraceContext?.trace_id).not.toEqual(customTrace2Context?.trace_id);
      expect(navigationTraceContext?.parent_span_id).toBeUndefined();

      expect(navigationTraceContext?.links).toEqual([
        {
          attributes: { 'sentry.link.type': 'previous_trace' },
          sampled: true,
          span_id: customTrace2Context?.span_id,
          trace_id: customTrace2Context?.trace_id,
        },
      ]);
    });
  });
});
