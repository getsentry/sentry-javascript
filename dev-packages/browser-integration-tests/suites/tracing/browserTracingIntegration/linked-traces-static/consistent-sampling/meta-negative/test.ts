import { expect } from '@playwright/test';
import type { ClientReport } from '@sentry/core';
import { extractTraceparentData, parseBaggageHeader } from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  envelopeUrlRegex,
  getEnvelopeType,
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
      page.on('request', request => {
        if (envelopeUrlRegex.test(request.url()) && getEnvelopeType(request) === 'transaction') {
          ++txnsReceived;
        }
      });

      const clientReportPromise = waitForClientReportRequest(page, report =>
        report.discarded_events.some(
          event => event.category === 'transaction' && event.reason === 'sample_rate' && event.quantity === 4,
        ),
      );

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

      await sentryTest.step('No transactions sent after processing completes', async () => {
        expect(await page.evaluate(() => (window as any).Sentry.flush())).toBe(true);
        expect(txnsReceived).toEqual(0);
      });
    },
  );
});
