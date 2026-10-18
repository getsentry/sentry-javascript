import { SENTRY_OP, URL_FULL } from '@sentry/conventions/attributes';
import { HTTP_CLIENT } from '@sentry/conventions/op';
import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';
import { expectConsistentTraceId, expectNoDuplicateSentryBaggageKeys, expectUserSetTraceId } from '../expects';

describe('double baggage prevention', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('fetch with manual getTraceData() does not duplicate sentry baggage entries', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/fetch-custom-headers', headers => {
          // fetch with manual getTraceData() headers
          expect(headers['sentry-trace']).not.toContain(',');
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expectConsistentTraceId(headers);
          expectUserSetTraceId(headers);
        })
        .get('/api/fetch', headers => {
          // fetch without manual headers (baseline)
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^[a-f\d]{32}-[a-f\d]{16}(-[01])?$/));
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expectConsistentTraceId(headers);
        })
        .get('/api/http-custom-headers', headers => {
          // http.request with manual getTraceData() headers
          expect(headers['sentry-trace']).not.toContain(',');
          expectNoDuplicateSentryBaggageKeys(headers['baggage']);
          expectConsistentTraceId(headers);
          expectUserSetTraceId(headers);
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .unordered()
        .expect({
          event: {
            exception: {
              values: [{ type: 'Error', value: 'done' }],
            },
          },
        })
        .expect({
          span: container => {
            const spans = container.items;
            expect(spans.map(span => span.attributes[URL_FULL]?.value).sort()).toEqual([
              `${SERVER_URL}/api/fetch`,
              `${SERVER_URL}/api/fetch-custom-headers`,
            ]);
            for (const span of spans) {
              expect(span.attributes[SENTRY_OP]?.value).toBe(HTTP_CLIENT);
              expect(span.is_segment).toBe(true);
              expect(span.parent_span_id).toBeUndefined();
            }
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
