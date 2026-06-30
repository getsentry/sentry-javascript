import { createTestServer } from '@sentry-internal/test-utils';
import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('maps configured request & response headers to span attributes', async () => {
  expect.assertions(2);

  const [SERVER_URL, closeTestServer] = await createTestServer()
    .get('/api/v0', headers => {
      expect(headers['x-test-header']).toBe('test-value');
    })
    .start();

  await createRunner(__dirname, 'scenario.ts')
    .withEnv({ SERVER_URL })
    .expect({
      transaction: {
        transaction: 'test_transaction',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: expect.stringMatching(/GET .*\/api\/v0/),
            op: 'http.client',
            origin: 'auto.http.otel.node_fetch',
            data: expect.objectContaining({
              'http.request.header.x-test-header': ['test-value'],
              'http.response.header.x-powered-by': ['Express'],
            }),
          }),
        ]),
      },
    })
    .start()
    .completed();
  closeTestServer();
});
