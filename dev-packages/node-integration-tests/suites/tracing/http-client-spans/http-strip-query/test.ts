import { createTestServer } from '@sentry-internal/test-utils';
import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('strips and handles query params in spans of outgoing http requests', async () => {
  expect.assertions(4);

  const [SERVER_URL, closeTestServer] = await createTestServer()
    .get('/api/v0/users', () => {
      // Just ensure we're called
      expect(true).toBe(true);
    })
    .start();

  await createRunner(__dirname, 'scenario.ts')
    .withEnv({ SERVER_URL })
    .expect({
      transaction: txn => {
        expect(txn.transaction).toEqual('test_transaction');
        expect(txn.spans).toHaveLength(1);
        expect(txn.spans?.[0]).toMatchObject({
          data: {
            url: `${SERVER_URL}/api/v0/users`,
            'http.url': `${SERVER_URL}/api/v0/users?id=1`,
            'http.target': '/api/v0/users?id=1',
            'http.flavor': '1.1',
            'http.host': expect.stringMatching(/localhost:\d+$/),
            'http.method': 'GET',
            'http.query': 'id=1',
            'http.response.status_code': 200,
            'http.response_content_length_uncompressed': 0,
            'http.status_code': 200,
            'http.status_text': 'OK',
            'net.peer.ip': '::1',
            'net.peer.name': 'localhost',
            'net.peer.port': expect.any(Number),
            'net.transport': 'ip_tcp',
            'otel.kind': 'CLIENT',
            'sentry.op': 'http.client',
            'sentry.origin': 'auto.http.otel.http',
          },
          description: `GET ${SERVER_URL}/api/v0/users`,
          op: 'http.client',
          origin: 'auto.http.otel.http',
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
