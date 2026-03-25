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

  // both headers must have the same trace_id
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

describe('double baggage prevention', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('fetch with manual getTraceData() does not duplicate sentry baggage entries', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/fetch-custom-headers', headers => {
          // fetch with manual getTraceData() headers
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^[a-f\d]{32}-[a-f\d]{16}$/));
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expectConsistentTraceId(headers);
          expectUserSetTraceId(headers);
        })
        .get('/api/fetch', headers => {
          // fetch without manual headers (baseline)
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^[a-f\d]{32}-[a-f\d]{16}$/));
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expectConsistentTraceId(headers);
        })
        .get('/api/http-custom-headers', headers => {
          // http.request with manual getTraceData() headers
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^[a-f\d]{32}-[a-f\d]{16}$/));
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expectConsistentTraceId(headers);
          expectUserSetTraceId(headers);
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .ignore('transaction')
        .expect({
          event: {
            exception: {
              values: [{ type: 'Error', value: 'done' }],
            },
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
