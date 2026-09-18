import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('outgoing fetch spans - strip query', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('strips and handles query params in spans of outgoing fetch requests', async () => {
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
                'url.path': '/api/v0/users',
                'url.query': 'id=1',
                'url.scheme': 'http',
                'http.request.method': 'GET',
                'http.request.method_original': 'GET',
                'http.response.status_code': 200,
                'network.peer.address': '::1',
                'network.peer.port': expect.any(Number),
                'sentry.kind': 'client',
                'server.port': expect.any(Number),
                'user_agent.original': 'node',
                'sentry.op': 'http.client',
                'sentry.origin': 'auto.http.node_fetch',
                'server.address': 'localhost',
              },
              description: `GET ${SERVER_URL}/api/v0/users`,
              op: 'http.client',
              origin: 'auto.http.node_fetch',
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
