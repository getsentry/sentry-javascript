import { describe, expect } from 'vitest';
import { conditionalTest } from '../../../../utils';
import { createEsmAndCjsTests } from '../../../../utils/runner';
import { createTestServer } from '../../../../utils/server';

describe('outgoing fetch', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    conditionalTest({ min: 22 })('node >=22', () => {
      test('outgoing fetch requests create breadcrumbs', async ({ signal }) => {
        const [SERVER_URL, closeTestServer] = await createTestServer({ signal }).start();

        await createRunner({ signal })
          .withEnv({ SERVER_URL })
          .expect({
            event: {
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
                    status_code: 404,
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
                    status_code: 404,
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
                    status_code: 404,
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
                    status_code: 404,
                    ADDED_PATH: '/api/v3',
                  },
                  timestamp: expect.any(Number),
                  type: 'http',
                },
              ],
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
          .start()
          .completed();

        closeTestServer();
      });
    });
  });
});
