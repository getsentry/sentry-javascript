import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';
import { createTestServer } from '../../../../utils/server';

test('captures spans for outgoing fetch requests', async () => {
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
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: expect.stringMatching(/GET .*\/api\/v0/),
            op: 'http.client',
            origin: 'auto.http.otel.node_fetch',
            status: 'ok',
          }),
          expect.objectContaining({
            description: expect.stringMatching(/GET .*\/api\/v1/),
            op: 'http.client',
            origin: 'auto.http.otel.node_fetch',
            status: 'not_found',
            data: expect.objectContaining({
              'http.response.status_code': 404,
            }),
          }),
        ]),
      },
    })
    .start()
    .completed();
  closeTestServer();
});
