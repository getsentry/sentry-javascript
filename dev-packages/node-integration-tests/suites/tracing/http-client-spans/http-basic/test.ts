import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';
import { supports } from '../../../../utils';

// Bun before 1.4 does not instrument outgoing `node:http` requests.
// See https://github.com/getsentry/sentry-javascript/issues/23881
describe.runIf(supports({ bunMin: '1.4.0' }))('outgoing http spans', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures spans for outgoing http requests', async () => {
      expect.assertions(3);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v0', () => {
          // Just ensure we're called
          expect(true).toBe(true);
        })
        .get(
          '/api/v1',
          () => {
            // Just ensure we're called
            expect(true).toBe(true);
          },
          404,
        )
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
                origin: 'auto.http.client',
                status: 'ok',
              }),
              expect.objectContaining({
                description: expect.stringMatching(/GET .*\/api\/v1/),
                op: 'http.client',
                origin: 'auto.http.client',
                status: 'not_found',
                data: expect.objectContaining({
                  'http.response.status_code': 404,
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
