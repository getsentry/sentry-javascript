import { expect } from '@playwright/test';
import { parseBaggageHeader } from '@sentry/core';
import path from 'path';
import { sentryTest } from '../../../../utils/fixtures';
import {
  countEnvelopes,
  eventAndTraceHeaderRequestParser,
  shouldSkipTracingTest,
  waitForErrorRequest,
  waitForTransactionRequest,
} from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpanAndTraceHeader } from '../../../../utils/spanUtils';

const META_TAG_TRACE_ID = '12345678901234567890123456789012';
const META_TAG_PARENT_SPAN_ID = '1234567890123456';

for (const lifecycle of ['stream', 'static'] as const) {
  sentryTest.describe(`pageload continued from a <meta> tag sentry-trace without a DSC (${lifecycle})`, () => {
    sentryTest.beforeEach(async ({ page }) => {
      sentryTest.skip(shouldSkipTracingTest());
      await page.addInitScript(lifecycle => {
        (window as any)._testTraceLifecycle = lifecycle;
      }, lifecycle);
      await page.route(/^https:\/\/o42\.ingest\.sentry\.io\//, route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-id' }) }),
      );
      await page.route('http://sentry-test-site.example/**', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
      );
    });

    for (const variant of ['sampled', 'sampled-third-party-baggage']) {
      sentryTest(
        `creates the DSC from the pageload span for a positive inherited decision (${variant})`,
        async ({ getLocalTestUrl, page }) => {
          const url = await getLocalTestUrl({ testDir: path.join(__dirname, variant) });
          const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');

          const expectedTraceHeader = {
            trace_id: META_TAG_TRACE_ID,
            public_key: 'public',
            environment: 'staging',
            release: '1.0.0',
            org_id: '42',
            sampled: 'true',
            sample_rate: '1',
            sample_rand: expect.stringMatching(/^0\.\d+$/),
          };

          if (lifecycle === 'stream') {
            const pageloadPromise = waitForStreamedSpanAndTraceHeader(
              page,
              span => span.is_segment && getSpanOp(span) === 'pageload',
            );
            await page.goto(url);
            await page.locator('#fetchBtn').click();
            const [pageloadSpan, traceHeader] = await pageloadPromise;

            expect(pageloadSpan).toMatchObject({
              trace_id: META_TAG_TRACE_ID,
              parent_span_id: META_TAG_PARENT_SPAN_ID,
            });
            expect(traceHeader).toEqual(expectedTraceHeader);
          } else {
            const pageloadPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');
            await page.goto(url);
            await page.locator('#fetchBtn').click();
            const [pageloadTransaction, traceHeader] = eventAndTraceHeaderRequestParser(await pageloadPromise);

            expect(pageloadTransaction.contexts?.trace).toMatchObject({
              trace_id: META_TAG_TRACE_ID,
              parent_span_id: META_TAG_PARENT_SPAN_ID,
            });
            expect(traceHeader).toEqual(expectedTraceHeader);
          }

          const headers = (await requestPromise).headers();
          expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[a-f\\d]{16}-1$`));
          expect(parseBaggageHeader(headers['baggage'])).toEqual({
            'sentry-trace_id': META_TAG_TRACE_ID,
            'sentry-public_key': 'public',
            'sentry-environment': 'staging',
            'sentry-release': '1.0.0',
            'sentry-org_id': '42',
            'sentry-sampled': 'true',
            'sentry-sample_rate': '1',
            'sentry-sample_rand': expect.stringMatching(/^0\.\d+$/),
          });

          const errorPromise = waitForErrorRequest(page);
          await page.locator('#errorBtn').click();
          const [errorEvent, errorTraceHeader] = eventAndTraceHeaderRequestParser(await errorPromise);

          expect(errorEvent.contexts?.trace?.trace_id).toBe(META_TAG_TRACE_ID);
          expect(errorTraceHeader).toEqual(expectedTraceHeader);
        },
      );
    }

    sentryTest(
      'creates the DSC from the unsampled pageload span for a negative inherited decision',
      async ({ getLocalTestUrl, page }) => {
        const url = await getLocalTestUrl({ testDir: path.join(__dirname, 'unsampled') });
        const segmentEnvelopeCount = countEnvelopes(page, { envelopeType: ['span', 'transaction'], timeout: 3000 });

        const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
        const errorPromise = waitForErrorRequest(page);
        await page.goto(url);
        await page.locator('#fetchBtn').click();
        await page.locator('#errorBtn').click();

        const [errorEvent, errorTraceHeader] = eventAndTraceHeaderRequestParser(await errorPromise);
        expect(errorEvent.contexts?.trace?.trace_id).toBe(META_TAG_TRACE_ID);
        expect(errorTraceHeader).toEqual({
          trace_id: META_TAG_TRACE_ID,
          public_key: 'public',
          environment: 'staging',
          release: '1.0.0',
          org_id: '42',
          sampled: 'false',
          sample_rate: '0',
          sample_rand: expect.stringMatching(/^0\.\d+$/),
        });

        const headers = (await requestPromise).headers();
        expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[a-f\\d]{16}-0$`));
        expect(parseBaggageHeader(headers['baggage'])).toEqual({
          'sentry-trace_id': META_TAG_TRACE_ID,
          'sentry-public_key': 'public',
          'sentry-environment': 'staging',
          'sentry-release': '1.0.0',
          'sentry-org_id': '42',
          'sentry-sampled': 'false',
          'sentry-sample_rate': '0',
          'sentry-sample_rand': errorTraceHeader?.sample_rand,
        });

        await page.evaluate(() => (window as any).Sentry.flush());
        expect(await segmentEnvelopeCount).toBe(0);
      },
    );

    sentryTest(
      'creates the DSC with the local tracesSampleRate for a deferred decision',
      async ({ getLocalTestUrl, page }) => {
        const url = await getLocalTestUrl({ testDir: path.join(__dirname, 'deferred') });

        const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
        const errorPromise = waitForErrorRequest(page);
        await page.goto(url);
        await page.locator('#fetchBtn').click();
        await page.locator('#errorBtn').click();

        const [errorEvent, errorTraceHeader] = eventAndTraceHeaderRequestParser(await errorPromise);
        const sampled = Number(errorTraceHeader?.sample_rand) < 0.5;

        expect(errorEvent.contexts?.trace?.trace_id).toBe(META_TAG_TRACE_ID);
        expect(errorTraceHeader).toEqual({
          trace_id: META_TAG_TRACE_ID,
          public_key: 'public',
          environment: 'staging',
          release: '1.0.0',
          org_id: '42',
          sampled: String(sampled),
          sample_rate: '0.5',
          sample_rand: expect.stringMatching(/^0\.\d+$/),
        });

        const headers = (await requestPromise).headers();
        expect(headers['sentry-trace']).toMatch(
          new RegExp(`^${META_TAG_TRACE_ID}-[a-f\\d]{16}-${sampled ? '1' : '0'}$`),
        );
        expect(parseBaggageHeader(headers['baggage'])).toEqual({
          'sentry-trace_id': META_TAG_TRACE_ID,
          'sentry-public_key': 'public',
          'sentry-environment': 'staging',
          'sentry-release': '1.0.0',
          'sentry-org_id': '42',
          'sentry-sampled': String(sampled),
          'sentry-sample_rate': '0.5',
          'sentry-sample_rand': errorTraceHeader?.sample_rand,
        });
      },
    );
  });
}
