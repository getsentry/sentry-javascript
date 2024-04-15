import { createRunner } from '../../../../utils/runner';
import { createTestServer } from '../../../../utils/server';

test('outgoing sampled http requests are correctly instrumented', done => {
  expect.assertions(15);

  createTestServer(done)
    .get('/api/v0', headers => {
      expect(headers['baggage']).toEqual(expect.any(String));
      expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})-1$/));
      expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-1');
      expect(headers['__requestUrl']).toBeUndefined();
    })
    .get('/api/v1', headers => {
      expect(headers['baggage']).toEqual(expect.any(String));
      expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})-1$/));
      expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-1');
      expect(headers['__requestUrl']).toBeUndefined();
    })
    .get('/api/v2', headers => {
      expect(headers['baggage']).toBeUndefined();
      expect(headers['sentry-trace']).toBeUndefined();
      expect(headers['__requestUrl']).toBeUndefined();
    })
    .get('/api/v3', headers => {
      expect(headers['baggage']).toBeUndefined();
      expect(headers['sentry-trace']).toBeUndefined();
      expect(headers['__requestUrl']).toBeUndefined();
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
