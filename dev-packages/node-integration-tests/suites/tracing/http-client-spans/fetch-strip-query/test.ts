import { HTTP_CLIENT } from '@sentry/conventions/op';
import {
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FULL,
  URL_PATH,
  URL_QUERY,
  URL_SCHEME,
  USER_AGENT_ORIGINAL,
} from '@sentry/conventions/attributes';
import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { EXPECTED_FETCH_SPAN_ORIGIN, INSTRUMENTS_UNDICI_FETCH } from '../../../../utils';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('outgoing fetch spans - strip query', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    async function runStripQueryTest(
      expectSpanAttributes: (serverUrl: string) => Record<string, unknown>,
    ): Promise<void> {
      expect.assertions(4);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v0/users', () => {
          // Just ensure we're called
          expect(true).toBe(true);
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment);
            const spans = container.items.filter(span => !span.is_segment);
            expect(segment?.name).toEqual('test_transaction');
            expect(spans).toHaveLength(1);
            expect(spans[0]).toMatchObject({
              attributes: {
                [URL_PATH]: { type: 'string', value: '/api/v0/users' },
                [URL_QUERY]: { type: 'string', value: 'id=1' },
                [URL_SCHEME]: { type: 'string', value: 'http' },
                [HTTP_REQUEST_METHOD]: { type: 'string', value: 'GET' },
                [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                [SENTRY_KIND]: { type: 'string', value: 'client' },
                [SERVER_PORT]: { type: 'integer', value: expect.any(Number) },
                [SENTRY_OP]: { type: 'string', value: HTTP_CLIENT },
                [SENTRY_ORIGIN]: { type: 'string', value: EXPECTED_FETCH_SPAN_ORIGIN },
                [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
                ...expectSpanAttributes(SERVER_URL),
              },
              name: 'GET localhost',
              status: 'ok',
              parent_span_id: segment?.span_id,
              span_id: expect.stringMatching(/[a-f\d]{16}/),
              trace_id: segment?.trace_id,
            });
          },
        })
        .start()
        .completed();
      closeTestServer();
    }

    // undici drops the fragment and sees the connection and the default headers.
    test.runIf(INSTRUMENTS_UNDICI_FETCH)(
      'strips and handles query params in spans of outgoing fetch requests (undici)',
      async () => {
        await runStripQueryTest(serverUrl => ({
          [URL_FULL]: { type: 'string', value: `${serverUrl}/api/v0/users?id=1` },
          'http.request.method_original': { type: 'string', value: 'GET' },
          [NETWORK_PEER_ADDRESS]: { type: 'string', value: '::1' },
          [NETWORK_PEER_PORT]: { type: 'integer', value: expect.any(Number) },
          [USER_AGENT_ORIGINAL]: { type: 'string', value: 'node' },
        }));
      },
    );

    // A patched global `fetch` keeps the fragment, and gets the method already normalized.
    test.skipIf(INSTRUMENTS_UNDICI_FETCH)(
      'strips and handles query params in spans of outgoing fetch requests (patched global fetch)',
      async () => {
        await runStripQueryTest(serverUrl => ({
          [URL_FULL]: { type: 'string', value: `${serverUrl}/api/v0/users?id=1#fragment` },
        }));
      },
    );
  });
});
