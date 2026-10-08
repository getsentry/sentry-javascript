import { SENTRY_OP } from '@sentry/conventions/attributes';
import { HTTP_CLIENT } from '@sentry/conventions/op';
import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect } from 'vitest';
import { RUNTIME } from '../../../../utils';
import { createEsmAndCjsTests } from '../../../../utils/runner';

describe('outgoing traceparent', () => {
  createEsmAndCjsTests(__dirname, 'scenario-fetch.mjs', 'instrument.mjs', (createRunner, test) => {
    test('outgoing fetch requests should get traceparent headers', async () => {
      expect.assertions(7);

      let outgoingSentryTrace: string | undefined;

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v1', headers => {
          outgoingSentryTrace = headers['sentry-trace'] as string;
          expect(headers['baggage']).toEqual(expect.any(String));
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
          expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-0');
          expect(headers['traceparent']).toEqual(expect.stringMatching(/^00-([a-f\d]{32})-([a-f\d]{16})-01$/));
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .expect({
          // The propagated `sentry-trace` must reference the `http.client` span, not the surrounding segment span.
          span: container => {
            const propagatedSpanId = outgoingSentryTrace?.split('-')[1];
            const httpClientSpan = container.items.find(span => span.attributes[SENTRY_OP]?.value === HTTP_CLIENT);

            expect(httpClientSpan).toBeDefined();
            expect(propagatedSpanId).toBe(httpClientSpan?.span_id);
            expect(propagatedSpanId).not.toBe(container.items.find(span => span.is_segment)?.span_id);
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-http.mjs', 'instrument.mjs', (createRunner, test) => {
    // Bun 1.3.14 does not instrument outgoing `node:http` requests.
    // See https://github.com/getsentry/sentry-javascript/issues/23881
    test.skipIf(RUNTIME === 'bun')('outgoing http requests should get traceparent headers', async () => {
      expect.assertions(5);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v1', headers => {
          expect(headers['baggage']).toEqual(expect.any(String));
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
          expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-0');
          expect(headers['traceparent']).toEqual(expect.stringMatching(/^00-([a-f\d]{32})-([a-f\d]{16})-01$/));
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .expect({
          span: {
            // Span contents are tested elsewhere.
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
