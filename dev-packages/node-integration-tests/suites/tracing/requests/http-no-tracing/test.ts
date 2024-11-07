import { createRunner } from '../../../../utils/runner';
import { createTestServer } from '../../../../utils/server';

test('outgoing http requests are correctly instrumented with tracing disabled', done => {
  expect.assertions(11);

  createTestServer(done)
    .get('/api/v0', headers => {
      expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/));
      expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000');
      expect(headers['baggage']).toEqual(expect.any(String));
    })
    .get('/api/v1', headers => {
      expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/));
      expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000');
      expect(headers['baggage']).toEqual(expect.any(String));
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
        .ensureNoErrorOutput()
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
            breadcrumbs: [
              {
                message: 'manual breadcrumb',
                timestamp: expect.any(Number),
              },
              {
                category: 'http',
                data: {
                  'http.method': 'GET',
                  url: `${SERVER_URL}/api/v0`,
                  status_code: 200,
                  ADDED_PATH: '/api/v0',
                },
                timestamp: expect.any(Number),
                type: 'http',
              },
              {
                category: 'http',
                data: {
                  'http.method': 'GET',
                  url: `${SERVER_URL}/api/v1`,
                  status_code: 200,
                  ADDED_PATH: '/api/v1',
                },
                timestamp: expect.any(Number),
                type: 'http',
              },
              {
                category: 'http',
                data: {
                  'http.method': 'GET',
                  url: `${SERVER_URL}/api/v2`,
                  status_code: 200,
                  ADDED_PATH: '/api/v2',
                },
                timestamp: expect.any(Number),
                type: 'http',
              },
              {
                category: 'http',
                data: {
                  'http.method': 'GET',
                  url: `${SERVER_URL}/api/v3`,
                  status_code: 200,
                  ADDED_PATH: '/api/v3',
                },
                timestamp: expect.any(Number),
                type: 'http',
              },
            ],
          },
        })
        .start(closeTestServer);
    });
});
