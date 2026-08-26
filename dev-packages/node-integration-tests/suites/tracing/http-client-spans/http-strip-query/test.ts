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
          transaction: txn => {
            expect(txn.transaction).toEqual('test_transaction');
            expect(txn.spans).toHaveLength(1);
            expect(txn.spans?.[0]).toMatchObject({
              data: {
                'url.full': `${SERVER_URL}/api/v0/users?id=1`,
                'http.target': '/api/v0/users?id=1',
                'http.request.method': 'GET',
                'url.query': 'id=1',
                'http.response.status_code': 200,
                'http.response.body.decoded_size': 0,
                'http.response.status_text': 'OK',
                'network.peer.address': '::1',
                'server.address': 'localhost',
                'network.peer.port': expect.any(Number),
                'network.transport': 'tcp',
                'sentry.kind': 'client',
                'sentry.op': 'http.client',
                'sentry.origin': 'auto.http.client',
              },
              description: `GET ${SERVER_URL}/api/v0/users`,
              op: 'http.client',
              origin: 'auto.http.client',
              status: 'ok',
              parent_span_id: txn.contexts?.trace?.span_id,
              span_id: expect.stringMatching(/[a-f\d]{16}/),
              trace_id: txn.contexts?.trace?.trace_id,
            });
          },
        })
        .start()
        .completed();

      closeTestServer();
    });
  });
});
