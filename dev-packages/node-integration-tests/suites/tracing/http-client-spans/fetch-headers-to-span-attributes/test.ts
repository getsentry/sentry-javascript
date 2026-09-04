import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('outgoing fetch spans - headers to span attributes', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('maps configured request & response headers to span attributes', async () => {
      expect.assertions(3);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v0', headers => {
          expect(headers['x-test-header']).toBe('test-value');
          expect(headers['authorization']).toBe('Bearer super-secret');
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .expect({
          transaction: {
            transaction: 'test_transaction',
            spans: expect.arrayContaining([
              expect.objectContaining({
                description: expect.stringMatching(/GET .*\/api\/v0/),
                op: 'http.client',
                origin: 'auto.http.node_fetch',
                data: expect.objectContaining({
                  'http.request.header.x-test-header': ['test-value'],
                  // Listing a header explicitly does not exempt it from the sensitive denylist.
                  'http.request.header.authorization': '[Filtered]',
                  'http.response.header.x-powered-by': ['Express'],
                }),
              }),
            ]),
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
