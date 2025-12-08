import { expect } from '@playwright/test';
import type { ClientReport } from '@sentry/core';
import { extractTraceparentData, parseBaggageHeader } from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  eventAndTraceHeaderRequestParser,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
  waitForTracingHeadersOnUrl,
  waitForTransactionRequest,
} from '../../../../../../utils/helpers';

const metaTagSampleRand = 0.9;
const metaTagSampleRate = 0.2;
const metaTagTraceIdIndex = '12345678901234567890123456789012';
const metaTagTraceIdPage1 = 'a2345678901234567890123456789012';

sentryTest.describe('When `consistentTraceSampling` is `true` and page contains <meta> tags', () => {
  sentryTest(
    'meta tag decision has precedence over sampling decision from previous trace in session storage',
    async ({ getLocalTestUrl, page }) => {
      if (shouldSkipTracingTest()) {
        sentryTest.skip();
      }

      const url = await getLocalTestUrl({ testDir: __dirname });

      const clientReportPromise = waitForClientReportRequest(page);

      await sentryTest.step('Initial pageload', async () => {
        // negative sampling decision -> no pageload txn
        await page.goto(url);
      });

      await sentryTest.step('Make fetch request', async () => {
        // The fetch requests starts a new trace on purpose. So we only want the
        // sampling decision and rand to be the same as from the meta tag but not the trace id or DSC
        const tracingHeadersPromise = waitForTracingHeadersOnUrl(page, 'http://sentry-test-external.io');

        await page.locator('#btn2').click();

        const { baggage, sentryTrace } = await tracingHeadersPromise;

        expect(sentryTrace).toBeDefined();
        expect(baggage).toBeDefined();

        expect(extractTraceparentData(sentryTrace)).toEqual({
          traceId: expect.not.stringContaining(metaTagTraceIdIndex),
          parentSpanId: expect.stringMatching(/^[\da-f]{16}$/),
          parentSampled: false,
        });

        expect(parseBaggageHeader(baggage)).toEqual({
          'sentry-environment': 'production',
          'sentry-public_key': 'public',
          'sentry-sample_rand': `${metaTagSampleRand}`,
          'sentry-sample_rate': `${metaTagSampleRate}`,
          'sentry-sampled': 'false',
          'sentry-trace_id': expect.not.stringContaining(metaTagTraceIdIndex),
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
              quantity: 2,
              reason: 'sample_rate',
            },
          ],
        });
      });

      await sentryTest.step('Navigate to another page with meta tags', async () => {
        const page1Pageload = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
        await page.locator('a').click();

        const [pageloadEvent, pageloadTraceHeader] = eventAndTraceHeaderRequestParser(await page1Pageload);
        const pageloadTraceContext = pageloadEvent.contexts?.trace;

        expect(Number(pageloadTraceHeader?.sample_rand)).toBe(0.12);
        expect(Number(pageloadTraceHeader?.sample_rate)).toBe(0.2);
        expect(pageloadTraceContext?.trace_id).toEqual(metaTagTraceIdPage1);
      });

      await sentryTest.step('Navigate to another page without meta tags', async () => {
        const page2Pageload = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
        await page.locator('a').click();

        const [pageloadEvent, pageloadTraceHeader] = eventAndTraceHeaderRequestParser(await page2Pageload);
        const pageloadTraceContext = pageloadEvent.contexts?.trace;

        expect(Number(pageloadTraceHeader?.sample_rand)).toBe(0.12);
        expect(Number(pageloadTraceHeader?.sample_rate)).toBe(0.2);
        expect(pageloadTraceContext?.trace_id).not.toEqual(metaTagTraceIdPage1);
        expect(pageloadTraceContext?.trace_id).not.toEqual(metaTagTraceIdIndex);
      });
    },
  );
});
