import { HTTP_CLIENT } from '@sentry/conventions/op';
import {
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_BODY_SIZE,
  HTTP_RESPONSE_STATUS_CODE,
  HTTP_RESPONSE_STATUS_TEXT,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  NETWORK_TRANSPORT,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  URL_FULL,
  URL_QUERY,
} from '@sentry/conventions/attributes';
import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('outgoing http spans - strip query', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('strips and handles query params in spans of outgoing http requests', async () => {
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
                [URL_FULL]: { type: 'string', value: `${SERVER_URL}/api/v0/users?id=1` },
                [HTTP_REQUEST_METHOD]: { type: 'string', value: 'GET' },
                [URL_QUERY]: { type: 'string', value: 'id=1' },
                [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
                [HTTP_RESPONSE_BODY_SIZE]: { type: 'integer', value: 0 },
                [HTTP_RESPONSE_STATUS_TEXT]: { type: 'string', value: 'OK' },
                [NETWORK_PEER_ADDRESS]: { type: 'string', value: '::1' },
                [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
                [NETWORK_PEER_PORT]: { type: 'integer', value: expect.any(Number) },
                [NETWORK_TRANSPORT]: { type: 'string', value: 'tcp' },
                [SENTRY_KIND]: { type: 'string', value: 'client' },
                [SENTRY_OP]: { type: 'string', value: HTTP_CLIENT },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.client' },
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
    });
  });
});
