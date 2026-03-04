import { expect } from '@playwright/test';
import type { ClientReport } from '@sentry/core';
import { extractTraceparentData, parseBaggageHeader } from '@sentry/core';
import type { SerializedStreamedSpan } from '@sentry/core/src';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
  waitForTracingHeadersOnUrl,
} from '../../../../../../utils/helpers';
import { observeStreamedSpan } from '../../../../../../utils/spanUtils';

const metaTagSampleRand = 0.9;
const metaTagSampleRate = 0.2;
const metaTagTraceId = '12345678901234567890123456789012';

sentryTest.describe('When `consistentTraceSampling` is `true` and page contains <meta> tags', () => {
  sentryTest(
    'Continues negative sampling decision from meta tag across all traces and downstream propagations',
    async ({ getLocalTestUrl, page }) => {
      sentryTest.skip(shouldSkipTracingTest());

      const url = await getLocalTestUrl({ testDir: __dirname });

      const spansReceived: SerializedStreamedSpan[] = [];
      observeStreamedSpan(page, span => {
        spansReceived.push(span);
        return false;
      });

      const clientReportPromise = waitForClientReportRequest(page);

      await sentryTest.step('Initial pageload', async () => {
        await page.goto(url);
        expect(spansReceived).toHaveLength(0);
      });

      await sentryTest.step('Custom instrumented button click', async () => {
        await page.locator('#btn1').click();
        expect(spansReceived).toHaveLength(0);
      });

      await sentryTest.step('Navigation', async () => {
        await page.goto(`${url}#foo`);
        expect(spansReceived).toHaveLength(0);
      });

      await sentryTest.step('Make fetch request', async () => {
        const tracingHeadersPromise = waitForTracingHeadersOnUrl(page, 'http://sentry-test-external.io');

        await page.locator('#btn2').click();
        const { baggage, sentryTrace } = await tracingHeadersPromise;

        expect(sentryTrace).toBeDefined();
        expect(baggage).toBeDefined();

        expect(extractTraceparentData(sentryTrace)).toEqual({
          traceId: expect.not.stringContaining(metaTagTraceId),
          parentSpanId: expect.stringMatching(/^[\da-f]{16}$/),
          parentSampled: false,
        });

        expect(parseBaggageHeader(baggage)).toEqual({
          'sentry-environment': 'production',
          'sentry-public_key': 'public',
          'sentry-sample_rand': `${metaTagSampleRand}`,
          'sentry-sample_rate': `${metaTagSampleRate}`,
          'sentry-sampled': 'false',
          'sentry-trace_id': expect.not.stringContaining(metaTagTraceId),
          'sentry-transaction': 'custom root span 2',
        });

        expect(spansReceived).toHaveLength(0);
      });

      await sentryTest.step('Client report', async () => {
        await hidePage(page);
        const clientReport = envelopeRequestParser<ClientReport>(await clientReportPromise);
        expect(clientReport).toEqual({
          timestamp: expect.any(Number),
          discarded_events: [
            {
              category: 'transaction',
              quantity: 4,
              reason: 'sample_rate',
            },
          ],
        });
      });

      expect(spansReceived).toHaveLength(0);
    },
  );
});
