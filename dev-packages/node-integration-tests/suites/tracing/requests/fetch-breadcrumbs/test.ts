import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';

describe('outgoing fetch', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('outgoing fetch requests create breadcrumbs', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer().start();

      await createRunner()
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
