import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../utils/runner';
import { extractTraceparentData, parseBaggageHeader, TRACEPARENT_REGEXP } from '@sentry/core';

function expectNoDuplicateSentryBaggageKeys(baggage: string | string[] | undefined): void {
  expect(baggage).toBeDefined();
  const baggageStr = Array.isArray(baggage) ? baggage.join(',') : (baggage as string);
  const sentryEntries = baggageStr.split(',').filter(entry => entry.trim().startsWith('sentry-'));
  const sentryKeyNames = sentryEntries.map(entry => entry.trim().split('=')[0]);
  const uniqueKeyNames = [...new Set(sentryKeyNames)];
  expect(sentryKeyNames).toEqual(uniqueKeyNames);
}

function expectConsistentTraceId(headers: Record<string, string | string[] | undefined>): void {
  const sentryTrace = headers['sentry-trace'];
  expect(sentryTrace).toMatch(TRACEPARENT_REGEXP);

  const sentryTraceData = extractTraceparentData(sentryTrace as string)!;
  expect(sentryTraceData.traceId).toMatch(/^[a-f\d]{32}$/);

  const baggage = parseBaggageHeader(headers['baggage']);

  const baggageTraceId = baggage!['sentry-trace_id'];
  expect(baggageTraceId).toBeDefined();
  expect(baggageTraceId).toMatch(/^[a-f\d]{32}$/);

  expect(sentryTraceData.traceId).toEqual(baggageTraceId);
}

function expectUserSetTraceId(headers: Record<string, string | string[] | undefined>): void {
  const xSentryTrace = extractTraceparentData(headers['x-tracedata-sentry-trace'] as string);
  const sentryTrace = extractTraceparentData(headers['sentry-trace'] as string);
  expect(xSentryTrace?.traceId).toBe(sentryTrace?.traceId);

  const xBaggage = parseBaggageHeader(headers['x-tracedata-baggage']);
  const baggage = parseBaggageHeader(headers['baggage']);
  expect(xBaggage).toEqual(baggage);
}

describe('double baggage prevention - http.client spans with parent span', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    let transactionTraceId = '000';
    let fetchSpanId = '000';
    let httpCustomHeadersSpanId = '000';
    let fetchCustomHeadersSpanId = '000';

    test('fetch with manual getTraceData() does not duplicate sentry baggage entries', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/fetch-custom-headers', headers => {
          // fetch with manual getTraceData() headers — core reproduction case
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expect(headers['sentry-trace']).not.toContain(',');
          expectConsistentTraceId(headers);
          expectUserSetTraceId(headers);
          const sentryTrace = extractTraceparentData(headers['sentry-trace'] as string);
          transactionTraceId = sentryTrace!.traceId!;
          fetchCustomHeadersSpanId = sentryTrace!.parentSpanId!;
        })
        .get('/api/fetch', headers => {
          // fetch without manual headers (baseline)
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^[a-f\d]{32}-[a-f\d]{16}(-[01])?$/));
          expectConsistentTraceId(headers);
          const sentryTrace = extractTraceparentData(headers['sentry-trace'] as string);
          fetchSpanId = sentryTrace!.parentSpanId!;
        })
        .get('/api/http-custom-headers', headers => {
          // http.request with manual getTraceData() headers
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expect(headers['sentry-trace']).not.toContain(',');
          expectConsistentTraceId(headers);
          expectUserSetTraceId(headers);
          const sentryTrace = extractTraceparentData(headers['sentry-trace'] as string);
          httpCustomHeadersSpanId = sentryTrace!.parentSpanId!;
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .ignore('event')
        .expect({
          transaction: txn => {
            expect(transactionTraceId).toMatch(/^[a-f0-9]{32}$/);

            expect(txn).toMatchObject({
              transaction: 'parent_span',
              spans: [
                {
                  op: 'http.client',
                  description: expect.stringMatching(/^GET .*\/api\/fetch-custom-headers$/),
                  data: {},
                  // span id is expected to be different since users call getTraceData() before the
                  // http.client span is created
                  span_id: expect.not.stringContaining(fetchCustomHeadersSpanId),
                  start_timestamp: expect.any(Number),
                  trace_id: transactionTraceId,
                },
                {
                  op: 'http.client',
                  description: expect.stringMatching(/^GET .*\/api\/fetch$/),
                  data: {},
                  span_id: fetchSpanId,
                  start_timestamp: expect.any(Number),
                  trace_id: transactionTraceId,
                },
                {
                  op: 'http.client',
                  description: expect.stringMatching(/^GET .*\/api\/http-custom-headers$/),
                  data: {},
                  // span id is expected to be different since users call getTraceData() before the
                  // http.client span is created
                  span_id: expect.not.stringContaining(httpCustomHeadersSpanId),
                  start_timestamp: expect.any(Number),
                  trace_id: transactionTraceId,
                },
              ],
            });
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
