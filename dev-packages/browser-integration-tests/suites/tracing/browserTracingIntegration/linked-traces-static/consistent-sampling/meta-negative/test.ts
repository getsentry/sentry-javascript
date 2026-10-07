import { expect } from '@playwright/test';
import type { ClientReport } from '@sentry/core';
import { extractTraceparentData, parseBaggageHeader } from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  getMultipleSentryEnvelopeRequests,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
  waitForTracingHeadersOnUrl,
} from '../../../../../../utils/helpers';

const metaTagSampleRand = 0.9;
const metaTagSampleRate = 0.2;
const metaTagTraceId = '12345678901234567890123456789012';

sentryTest.describe('When `consistentTraceSampling` is `true` and page contains <meta> tags', () => {
  sentryTest(
    'Continues negative sampling decision from meta tag across all traces and downstream propagations',
    async ({ getLocalTestUrl, page }) => {
      if (shouldSkipTracingTest()) {
        sentryTest.skip();
      }

      const url = await getLocalTestUrl({ testDir: __dirname });

      let txnsReceived = 0;
      // @ts-expect-error - no need to return something valid here
      getMultipleSentryEnvelopeRequests<Event>(page, 1, { envelopeType: 'transaction' }, () => {
        ++txnsReceived;
        return {};
      });

      const clientReportPromise = waitForClientReportRequest(page);

      await sentryTest.step('Initial pageload', async () => {
        await page.goto(url);
        expect(txnsReceived).toEqual(0);
      });

      await sentryTest.step('Custom instrumented button click', async () => {
        await page.locator('#btn1').click();
        expect(txnsReceived).toEqual(0);
      });

      await sentryTest.step('Navigation', async () => {
        await page.goto(`${url}#foo`);
        expect(txnsReceived).toEqual(0);
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

      await sentryTest.step('Wait for transactions to be discarded', async () => {
        // give it a little longer just in case a txn is pending to be sent
        await page.waitForTimeout(1000);
        expect(txnsReceived).toEqual(0);
      });
    },
  );
});
