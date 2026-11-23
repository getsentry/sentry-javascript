import { expect } from '@playwright/test';
import { parseBaggageHeader } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  eventAndTraceHeaderRequestParser,
  shouldSkipTracingTest,
  waitForErrorRequest,
  waitForTransactionRequest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';
import {
  collectStreamedSpans,
  waitForStreamedSpanAndTraceHeader,
  waitForStreamedSpanAndTraceHeaderOnUrl,
} from '../../../../utils/spanUtils';

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
      'continueTrace continues a sampled incoming trace into span and outgoing request',
      async ({ getLocalTestUrl, page }) => {
        const url = await getLocalTestUrl({ testDir: __dirname });
        await (lifecycle === 'stream'
          ? waitForStreamedSpanAndTraceHeaderOnUrl(page, url)
          : waitForTransactionRequestOnUrl(page, url));

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
          await page.locator('#sampled').click();
          const [span, traceHeader] = await spanPromise;

          expect(span).toMatchObject({ trace_id: SAMPLED_TRACE_ID, parent_span_id: SAMPLED_SPAN_ID });
          expect(traceHeader).toEqual(expectedTraceHeader);
        } else {
          const transactionPromise = waitForTransactionRequest(
            page,
            event => event.transaction === 'continued-sampled',
          );
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

    sentryTest(
      'continueTrace continues an unsampled incoming trace without emitting a span',
      async ({ getLocalTestUrl, page }) => {
        const url = await getLocalTestUrl({ testDir: __dirname });
        await (lifecycle === 'stream'
          ? waitForStreamedSpanAndTraceHeaderOnUrl(page, url)
          : waitForTransactionRequestOnUrl(page, url));

        const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');
        const errorPromise = waitForErrorRequest(page);
        const spans = collectStreamedSpans(page);
        await page.locator('#unsampled').click();

        const [errorEvent, traceHeader] = eventAndTraceHeaderRequestParser(await errorPromise);
        expect(errorEvent.contexts?.trace?.trace_id).toBe(UNSAMPLED_TRACE_ID);
        expect(traceHeader).toEqual({
          trace_id: UNSAMPLED_TRACE_ID,
          public_key: 'public',
          environment: 'production',
          transaction: 'continued-unsampled',
          sampled: 'false',
          sample_rate: '0',
          sample_rand: expect.stringMatching(/^0\.\d+$/),
        });

        const headers = await (await outgoingRequestPromise).allHeaders();
        expect(headers['sentry-trace']).toMatch(new RegExp(`^${UNSAMPLED_TRACE_ID}-[a-f0-9]{16}-0$`));
        expect(parseBaggageHeader(headers['baggage'])).toEqual({
          'sentry-trace_id': UNSAMPLED_TRACE_ID,
          'sentry-public_key': 'public',
          'sentry-environment': 'production',
          'sentry-transaction': 'continued-unsampled',
          'sentry-sampled': 'false',
          'sentry-sample_rate': '0',
          'sentry-sample_rand': traceHeader?.sample_rand,
        });

        if (lifecycle === 'stream') {
          await page.evaluate(() => (window as any).Sentry.flush());
          expect(spans.some(span => span.trace_id === UNSAMPLED_TRACE_ID)).toBe(false);
        }
      },
    );

    sentryTest(
      'continueTrace continues a deferred-sampling incoming trace and applies the local sample rate',
      async ({ getLocalTestUrl, page }) => {
        const url = await getLocalTestUrl({ testDir: __dirname });
        await (lifecycle === 'stream'
          ? waitForStreamedSpanAndTraceHeaderOnUrl(page, url)
          : waitForTransactionRequestOnUrl(page, url));

        const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');

        const expectedTraceHeader = {
          trace_id: DEFERRED_TRACE_ID,
          public_key: 'public',
          environment: 'production',
          transaction: 'continued-deferred',
          sampled: 'true',
          sample_rate: '1',
          sample_rand: expect.stringMatching(/^0\.\d+$/),
        };

        if (lifecycle === 'stream') {
          const spanPromise = waitForStreamedSpanAndTraceHeader(
            page,
            span => span.is_segment && span.name === 'continued-deferred',
          );
          await page.locator('#deferred').click();
          const [span, traceHeader] = await spanPromise;

          expect(span.trace_id).toBe(DEFERRED_TRACE_ID);
          expect(traceHeader).toEqual(expectedTraceHeader);
        } else {
          const transactionPromise = waitForTransactionRequest(
            page,
            event => event.transaction === 'continued-deferred',
          );
          await page.locator('#deferred').click();
          const [transaction, traceHeader] = eventAndTraceHeaderRequestParser(await transactionPromise);

          expect(transaction.contexts?.trace?.trace_id).toBe(DEFERRED_TRACE_ID);
          expect(traceHeader).toEqual(expectedTraceHeader);
        }

        const headers = await (await outgoingRequestPromise).allHeaders();
        expect(headers['sentry-trace']).toMatch(new RegExp(`^${DEFERRED_TRACE_ID}-[a-f0-9]{16}-1$`));
        expect(parseBaggageHeader(headers['baggage'])).toEqual({
          'sentry-trace_id': DEFERRED_TRACE_ID,
          'sentry-public_key': 'public',
          'sentry-environment': 'production',
          'sentry-transaction': 'continued-deferred',
          'sentry-sampled': 'true',
          'sentry-sample_rate': '1',
          'sentry-sample_rand': expect.stringMatching(/^0\.\d+$/),
        });
      },
    );

    sentryTest('continueTrace with no incoming trace starts a fresh trace', async ({ getLocalTestUrl, page }) => {
      const url = await getLocalTestUrl({ testDir: __dirname });

      if (lifecycle === 'stream') {
        const [pageloadSpan] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

        const spanPromise = waitForStreamedSpanAndTraceHeader(
          page,
          span => span.is_segment && span.name === 'continued-noTrace',
        );
        await page.locator('#noTrace').click();
        const [span] = await spanPromise;

        expect(span.trace_id).toMatch(/^[a-f0-9]{32}$/);
        expect(span.trace_id).not.toBe(pageloadSpan.trace_id);
        expect(span.parent_span_id).toBeUndefined();
      } else {
        const pageload = envelopeRequestParser(await waitForTransactionRequestOnUrl(page, url));

        const transactionPromise = waitForTransactionRequest(page, event => event.transaction === 'continued-noTrace');
        await page.locator('#noTrace').click();
        const transaction = envelopeRequestParser(await transactionPromise);

        expect(transaction.contexts?.trace?.trace_id).toMatch(/^[a-f0-9]{32}$/);
        expect(transaction.contexts?.trace?.trace_id).not.toBe(pageload.contexts?.trace?.trace_id);
        expect(transaction.contexts?.trace?.parent_span_id).toBeUndefined();
      }
    });
  });
}
