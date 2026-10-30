import { expect } from '@playwright/test';
import { parseBaggageHeader } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  countEnvelopes,
  eventAndTraceHeaderRequestParser,
  shouldSkipTracingTest,
  waitForErrorRequest,
  waitForTransactionRequest,
} from '../../../../utils/helpers';
import { waitForStreamedSpanAndTraceHeader } from '../../../../utils/spanUtils';

const SAMPLED_TRACE_ID = '12345678901234567890123456789012';
const SAMPLED_SPAN_ID = '1234567890123456';
const UNSAMPLED_TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DEFERRED_TRACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

for (const lifecycle of ['stream', 'static'] as const) {
  sentryTest.describe(`traceLifecycle: ${lifecycle}`, () => {
    sentryTest.beforeEach(async ({ page }) => {
      sentryTest.skip(shouldSkipTracingTest());
      await page.addInitScript(lifecycle => {
        (window as any)._testTraceLifecycle = lifecycle;
      }, lifecycle);
      await page.route('http://sentry-test-site.example/**', route => {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      });
    });

    sentryTest(
      'continueTrace honors a positive incoming sampling decision over tracesSampleRate=0',
      async ({ getLocalTestUrl, page }) => {
        const url = await getLocalTestUrl({ testDir: __dirname });
        const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');

        // The incoming DSC is frozen as-is.
        const expectedTraceHeader = {
          trace_id: SAMPLED_TRACE_ID,
          sample_rate: '1',
          sampled: 'true',
          public_key: 'public',
          sample_rand: '0.42',
        };

        if (lifecycle === 'stream') {
          const spanPromise = waitForStreamedSpanAndTraceHeader(
            page,
            span => span.is_segment && span.name === 'continued-sampled',
          );
          await page.goto(url);
          await page.locator('#sampled').click();
          const [span, traceHeader] = await spanPromise;

          expect(span).toMatchObject({ trace_id: SAMPLED_TRACE_ID, parent_span_id: SAMPLED_SPAN_ID });
          expect(traceHeader).toEqual(expectedTraceHeader);
        } else {
          const transactionPromise = waitForTransactionRequest(
            page,
            event => event.transaction === 'continued-sampled',
          );
          await page.goto(url);
          await page.locator('#sampled').click();
          const [transaction, traceHeader] = eventAndTraceHeaderRequestParser(await transactionPromise);

          expect(transaction.contexts?.trace).toMatchObject({
            trace_id: SAMPLED_TRACE_ID,
            parent_span_id: SAMPLED_SPAN_ID,
          });
          expect(traceHeader).toEqual(expectedTraceHeader);
        }

        const headers = await (await outgoingRequestPromise).allHeaders();
        expect(headers['sentry-trace']).toMatch(new RegExp(`^${SAMPLED_TRACE_ID}-[a-f0-9]{16}-1$`));
        expect(parseBaggageHeader(headers['baggage'])).toEqual({
          'sentry-trace_id': SAMPLED_TRACE_ID,
          'sentry-sample_rate': '1',
          'sentry-sampled': 'true',
          'sentry-public_key': 'public',
          'sentry-sample_rand': '0.42',
        });
      },
    );

    for (const { button, traceId } of [
      { button: 'deferred', traceId: DEFERRED_TRACE_ID },
      { button: 'unsampled', traceId: UNSAMPLED_TRACE_ID },
    ]) {
      sentryTest(
        `continueTrace does not emit a span for the ${button} incoming trace with tracesSampleRate=0`,
        async ({ getLocalTestUrl, page }) => {
          const url = await getLocalTestUrl({ testDir: __dirname });
          const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');
          await page.goto(url);

          const errorPromise = waitForErrorRequest(page);
          const segmentEnvelopeCount = countEnvelopes(page, { envelopeType: ['span', 'transaction'], timeout: 2000 });
          await page.locator(`#${button}`).click();

          const [errorEvent, traceHeader] = eventAndTraceHeaderRequestParser(await errorPromise);
          expect(errorEvent.contexts?.trace?.trace_id).toBe(traceId);
          expect(traceHeader).toEqual({
            trace_id: traceId,
            public_key: 'public',
            environment: 'production',
            transaction: `continued-${button}`,
            sampled: 'false',
            sample_rate: '0',
            sample_rand: expect.stringMatching(/^0\.\d+$/),
          });

          const headers = await (await outgoingRequestPromise).allHeaders();
          expect(headers['sentry-trace']).toMatch(new RegExp(`^${traceId}-[a-f0-9]{16}-0$`));
          expect(parseBaggageHeader(headers['baggage'])).toEqual({
            'sentry-trace_id': traceId,
            'sentry-public_key': 'public',
            'sentry-environment': 'production',
            'sentry-transaction': `continued-${button}`,
            'sentry-sampled': 'false',
            'sentry-sample_rate': '0',
            'sentry-sample_rand': traceHeader?.sample_rand,
          });

          await page.evaluate(() => (window as any).Sentry.flush());
          expect(await segmentEnvelopeCount).toBe(0);
        },
      );
    }
  });
}
