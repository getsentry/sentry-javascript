import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/browser';
import type { ClientReport } from '@sentry/core';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
} from '../../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpanEnvelope } from '../../../../../../utils/spanUtils';

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

    const { pageloadSpan } = await sentryTest.step('Initial pageload', async () => {
      const pageloadEnvelopePromise = waitForStreamedSpanEnvelope(
        page,
        env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'pageload'),
      );
      await page.goto(url);

      const envelope = await pageloadEnvelopePromise;
      const pageloadSpan = envelope[1][0][1].items.find(s => getSpanOp(s) === 'pageload')!;

      expect(pageloadSpan.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]?.value).toBe(1);
      expect(Number(envelope[0].trace?.sample_rand)).toBeGreaterThanOrEqual(0);

      return { pageloadSpan };
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

    const { customTrace2Span } = await sentryTest.step(
      'Custom trace 2 is sampled positively (explicitly in tracesSampler)',
      async () => {
        const customEnvelopePromise = waitForStreamedSpanEnvelope(
          page,
          env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'custom'),
        );

        await page.locator('#btn2').click();

        const envelope = await customEnvelopePromise;
        const customTrace2Span = envelope[1][0][1].items.find(s => getSpanOp(s) === 'custom')!;

        expect(customTrace2Span.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]?.value).toBe(1);
        expect(customTrace2Span.trace_id).not.toEqual(pageloadSpan.trace_id);
        expect(customTrace2Span.parent_span_id).toBeUndefined();

        expect(customTrace2Span.links).toEqual([
          {
            attributes: {
              [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: {
                type: 'string',
                value: 'previous_trace',
              },
            },
            sampled: false,
            span_id: expect.stringMatching(/^[\da-f]{16}$/),
            trace_id: expect.stringMatching(/^[\da-f]{32}$/),
          },
        ]);

        return { customTrace2Span };
      },
    );

    await sentryTest.step('Navigation trace is sampled positively (inherited from previous trace)', async () => {
      const navigationEnvelopePromise = waitForStreamedSpanEnvelope(
        page,
        env => env[0].trace?.sampled === 'true' && !!env[1][0][1].items.find(s => getSpanOp(s) === 'navigation'),
      );

      await page.goto(`${url}#bar`);

      const envelope = await navigationEnvelopePromise;
      const navigationSpan = envelope[1][0][1].items.find(s => getSpanOp(s) === 'navigation')!;

      expect(navigationSpan.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]?.value).toBe(1);
      expect(navigationSpan.trace_id).not.toEqual(customTrace2Span.trace_id);
      expect(navigationSpan.parent_span_id).toBeUndefined();

      expect(navigationSpan.links).toEqual([
        {
          attributes: {
            [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: {
              type: 'string',
              value: 'previous_trace',
            },
          },
          sampled: true,
          span_id: customTrace2Span.span_id,
          trace_id: customTrace2Span.trace_id,
        },
      ]);
    });
  });
});
