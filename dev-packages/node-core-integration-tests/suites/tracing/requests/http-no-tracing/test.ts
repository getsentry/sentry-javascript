import { describe, expect } from 'vitest';
import { conditionalTest } from '../../../../utils';
import { createEsmAndCjsTests } from '../../../../utils/runner';
import { createTestServer } from '../../../../utils/server';

describe('outgoing http', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    conditionalTest({ min: 22 })('node >=22', () => {
      test('outgoing http requests are correctly instrumented with tracing disabled', async () => {
        expect.assertions(11);

        const [SERVER_URL, closeTestServer] = await createTestServer()
          .get('/api/v0', headers => {
            expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})$/));
            expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000');
            expect(headers['baggage']).toEqual(expect.any(String));
          })
          .get('/api/v1', headers => {
            expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})$/));
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
          .start();

        await createRunner()
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
          .start()
          .completed();
        closeTestServer();
      });
    });
  });
});
