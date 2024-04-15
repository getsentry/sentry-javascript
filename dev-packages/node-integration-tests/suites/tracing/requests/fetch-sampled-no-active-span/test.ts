import { conditionalTest } from '../../../../utils';
import { createRunner } from '../../../../utils/runner';
import { createTestServer } from '../../../../utils/server';

conditionalTest({ min: 18 })('outgoing fetch', () => {
  test('outgoing sampled fetch requests without active span are correctly instrumented', done => {
    expect.assertions(11);

    createTestServer(done)
      .get('/api/v0', headers => {
        expect(headers['baggage']).toEqual(expect.any(String));
        expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/));
        expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000');
      })
      .get('/api/v1', headers => {
        expect(headers['baggage']).toEqual(expect.any(String));
        expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/));
        expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000');
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
          .ignore('session', 'sessions')
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
          .start(done);
      });
  });
});
