import { join } from 'path';
import { conditionalTest } from '../../../../utils';
import { createRunner } from '../../../../utils/runner';
import { createTestServer } from '../../../../utils/server';

conditionalTest({ min: 18 })('outgoing http in ESM', () => {
  test('outgoing sampled http requests are correctly instrumented in ESM', done => {
    expect.assertions(11);

    createTestServer(done)
      .get('/api/v0', headers => {
        expect(headers['baggage']).toEqual(expect.any(String));
        expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})-1$/));
        expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-1');
      })
      .get('/api/v1', headers => {
        expect(headers['baggage']).toEqual(expect.any(String));
        expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})-1$/));
        expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-1');
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
      .then(([SERVER_URL, closeTestServer]) => {
        const instrumentPath = join(__dirname, 'instrument.mjs');
        createRunner(__dirname, 'scenario.mjs')
          .withFlags('--import', instrumentPath)
          .withEnv({ SERVER_URL })
          .expect({
            transaction: {
              // we're not too concerned with the actual transaction here since this is tested elsewhere
            },
          })
          .start(closeTestServer);
      });
  });
});
