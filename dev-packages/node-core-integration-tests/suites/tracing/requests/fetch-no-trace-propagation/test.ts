import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';

describe('outgoing fetch with tracePropagation disabled', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('does not inject trace headers but still creates breadcrumbs', async () => {
      expect.assertions(5);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v0', headers => {
          expect(headers['sentry-trace']).toBeUndefined();
          expect(headers['baggage']).toBeUndefined();
        })
        .get('/api/v1', headers => {
          expect(headers['sentry-trace']).toBeUndefined();
          expect(headers['baggage']).toBeUndefined();
        })
        .start();

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
                  status_code: 200,
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
