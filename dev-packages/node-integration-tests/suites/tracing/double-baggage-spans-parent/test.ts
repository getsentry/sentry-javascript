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

describe('double baggage prevention - http.client spans with parent span', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('fetch with manual getTraceData() does not duplicate sentry baggage entries', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v0', headers => {
          // fetch with manual getTraceData() headers — core reproduction case
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expect(headers['sentry-trace']).not.toContain(',');
          expectConsistentTraceId(headers);
        })
        .get('/api/v1', headers => {
          // fetch without manual headers (baseline)
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^[a-f\d]{32}-[a-f\d]{16}(-[01])?$/));
          expectConsistentTraceId(headers);
        })
        .get('/api/v2', headers => {
          // http.request with manual getTraceData() headers
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expect(headers['sentry-trace']).not.toContain(',');
          expectConsistentTraceId(headers);
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'parent_span',
            spans: [
              {
                op: 'http.client',
                description: expect.stringMatching(/^GET .*\/api\/v0$/),
                data: {},
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                start_timestamp: expect.any(Number),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
              },
              {
                op: 'http.client',
                description: expect.stringMatching(/^GET .*\/api\/v1$/),
                data: {},
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                start_timestamp: expect.any(Number),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
              },
              {
                op: 'http.client',
                description: expect.stringMatching(/^GET .*\/api\/v2$/),
                data: {},
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                start_timestamp: expect.any(Number),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
              },
            ],
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
