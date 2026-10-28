import { SENTRY_OP, URL_FULL } from '@sentry/conventions/attributes';
import { HTTP_CLIENT } from '@sentry/conventions/op';
import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';
import { extractTraceparentData } from '@sentry/core';
import { expectConsistentTraceId, expectNoDuplicateSentryBaggageKeys, expectUserSetTraceId } from '../expects';

describe('double baggage prevention - http.client spans with parent span', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    let traceId = '000';
    let fetchSpanId = '000';
    let httpCustomHeadersSpanId = '000';
    let fetchCustomHeadersSpanId = '000';

    test('fetch with manual getTraceData() does not duplicate sentry baggage entries', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/fetch-custom-headers', headers => {
          // fetch with manual getTraceData() headers — core reproduction case
          const sentryTrace = extractTraceparentData(headers['sentry-trace'] as string);
          traceId = sentryTrace!.traceId!;
          fetchCustomHeadersSpanId = sentryTrace!.parentSpanId!;
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expect(headers['sentry-trace']).not.toContain(',');
          expectConsistentTraceId(headers);
          expectUserSetTraceId(headers);
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
          span: container => {
            expect(traceId).toMatch(/^[a-f0-9]{32}$/);

            expect(container.items.find(span => span.is_segment)?.name).toBe('parent_span');
            expect(container.items.filter(span => !span.is_segment)).toMatchObject([
              {
                name: 'GET localhost',
                attributes: {
                  [SENTRY_OP]: { type: 'string', value: HTTP_CLIENT },
                  [URL_FULL]: { type: 'string', value: expect.stringMatching(/^.*\/api\/fetch-custom-headers$/) },
                },
                // span id is expected to be different since users call getTraceData() before the
                // http.client span is created
                span_id: expect.not.stringContaining(fetchCustomHeadersSpanId),
                start_timestamp: expect.any(Number),
                trace_id: traceId,
              },
              {
                name: 'GET localhost',
                attributes: {
                  [SENTRY_OP]: { type: 'string', value: HTTP_CLIENT },
                  [URL_FULL]: { type: 'string', value: expect.stringMatching(/^.*\/api\/fetch$/) },
                },
                span_id: fetchSpanId,
                start_timestamp: expect.any(Number),
                trace_id: traceId,
              },
              {
                name: 'GET localhost',
                attributes: {
                  [SENTRY_OP]: { type: 'string', value: HTTP_CLIENT },
                  [URL_FULL]: { type: 'string', value: expect.stringMatching(/^.*\/api\/http-custom-headers$/) },
                },
                // span id is expected to be different since users call getTraceData() before the
                // http.client span is created
                span_id: expect.not.stringContaining(httpCustomHeadersSpanId),
                start_timestamp: expect.any(Number),
                trace_id: traceId,
              },
            ]);
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
