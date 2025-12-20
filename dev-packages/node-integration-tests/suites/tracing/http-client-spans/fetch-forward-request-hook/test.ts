import { createTestServer } from '@sentry-internal/test-utils';
import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('adds requestHook and responseHook attributes to spans of outgoing fetch requests', async () => {
  expect.assertions(3);

  const [SERVER_URL, closeTestServer] = await createTestServer()
    .get('/api/v0', () => {
      // Just ensure we're called
      expect(true).toBe(true);
    })
    .get(
      '/api/v1',
      () => {
        // Just ensure we're called
        expect(true).toBe(true);
      },
      404,
    )
    .start();

  await createRunner(__dirname, 'scenario.ts')
    .withEnv({ SERVER_URL })
    .expect({
      transaction: {
        transaction: 'test_transaction',
        spans: [
          expect.objectContaining({
            description: expect.stringMatching(/GET .*\/api\/v0/),
            op: 'http.client',
            origin: 'auto.http.otel.node_fetch',
            status: 'ok',
            data: expect.objectContaining({
              'sentry.request.hook': '/api/v0',
              'sentry.response.hook.path': '/api/v0',
              'sentry.response.hook.status_code': 200,
            }),
          }),
          expect.objectContaining({
            description: expect.stringMatching(/GET .*\/api\/v1/),
            op: 'http.client',
            origin: 'auto.http.otel.node_fetch',
            status: 'not_found',
            data: expect.objectContaining({
              'sentry.request.hook': '/api/v1',
              'sentry.response.hook.path': '/api/v1',
              'sentry.response.hook.status_code': 404,
              'http.response.status_code': 404,
            }),
          }),
        ],
      },
    })
    .start()
    .completed();
  closeTestServer();
});
