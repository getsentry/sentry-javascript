import { createRunner } from '../../../utils/runner';
import { createTestServer } from '../../../utils/server';

test('should capture spans for outgoing http requests', done => {
  expect.assertions(3);

  createTestServer(done)
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
    .start()
    .then(SERVER_URL => {
      createRunner(__dirname, 'scenario.ts')
        .withEnv({ SERVER_URL })
        .expect({
          transaction: {
            transaction: 'test_transaction',
            spans: expect.arrayContaining([
              expect.objectContaining({
                description: expect.stringMatching(/GET .*\/api\/v0/),
                op: 'http.client',
                origin: 'auto.http.otel.http',
                status: 'ok',
              }),
              expect.objectContaining({
                description: expect.stringMatching(/GET .*\/api\/v1/),
                op: 'http.client',
                origin: 'auto.http.otel.http',
                status: 'unknown_error',
                data: expect.objectContaining({
                  'http.response.status_code': 404,
                }),
              }),
            ]),
          },
        })
        .start(done);
    });
});
