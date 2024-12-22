import { createRunner } from '../../../../utils/runner';
import { createTestServer } from '../../../../utils/server';

describe('outgoing fetch', () => {
  test('outgoing fetch requests are correctly instrumented when not sampled', done => {
    expect.assertions(11);

    createTestServer(done)
      .get('/api/v0', headers => {
        expect(headers['baggage']).toEqual(expect.any(String));
        expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})-0$/));
        expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-0');
      })
      .get('/api/v1', headers => {
        expect(headers['baggage']).toEqual(expect.any(String));
        expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})-0$/));
        expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-0');
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
        createRunner(__dirname, 'scenario.ts')
          .withEnv({ SERVER_URL })
          .expect({
            event: {
              exception: {
                values: [
                  {
                    type: 'Error',
                    value: 'foo',
                  },
                ],
              },
            },
          })
          .start(closeTestServer);
      });
  });
});
