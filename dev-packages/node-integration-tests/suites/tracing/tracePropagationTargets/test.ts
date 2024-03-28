import { createRunner } from '../../../utils/runner';
import { createTestServer } from '../../../utils/server';

test('HttpIntegration should instrument correct requests when tracePropagationTargets option is provided', done => {
  expect.assertions(9);

  createTestServer(done)
    .get('/api/v0', headers => {
      expect(typeof headers['baggage']).toBe('string');
      expect(typeof headers['sentry-trace']).toBe('string');
    })
    .get('/api/v1', headers => {
      expect(typeof headers['baggage']).toBe('string');
      expect(typeof headers['sentry-trace']).toBe('string');
    })
    .get('/api/v2', headers => {
      expect(headers['baggage']).toBeUndefined();
      expect(headers['sentry-trace']).toBeUndefined();
    })
    .get('/api/v3', headers => {
      expect(headers['baggage']).toBeUndefined();
      expect(headers['sentry-trace']).toBeUndefined();
    })
    .start()
    .then(SERVER_URL => {
      createRunner(__dirname, 'scenario.ts')
        .withEnv({ SERVER_URL })
        .expect({
          transaction: {
            // we're not too concerned with the actual transaction here since this is tested elsewhere
          },
        })
        .start(done);
    });
});
