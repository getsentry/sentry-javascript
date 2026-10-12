import { HTTP_CLIENT } from '@sentry/conventions/op';
import { HTTP_RESPONSE_STATUS_CODE, SENTRY_OP, SENTRY_ORIGIN, URL_FULL } from '@sentry/conventions/attributes';
import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('outgoing fetch spans - request/response hooks', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('adds requestHook and responseHook attributes to spans of outgoing fetch requests', async () => {
      expect.assertions(4);

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
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('test_transaction');
            expect(container.items.filter(span => !span.is_segment)).toEqual([
              expect.objectContaining({
                name: 'GET localhost',
                status: 'ok',
                attributes: expect.objectContaining({
                  [URL_FULL]: { type: 'string', value: expect.stringMatching(/.*\/api\/v0/) },
                  [SENTRY_OP]: { type: 'string', value: HTTP_CLIENT },
                  [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.node_fetch' },
                  'sentry.request.hook': { type: 'string', value: '/api/v0' },
                  'sentry.response.hook.path': { type: 'string', value: '/api/v0' },
                  'sentry.response.hook.status_code': { type: 'integer', value: 200 },
                }),
              }),
              expect.objectContaining({
                name: 'GET localhost',
                status: 'error',
                attributes: expect.objectContaining({
                  [URL_FULL]: { type: 'string', value: expect.stringMatching(/.*\/api\/v1/) },
                  [SENTRY_OP]: { type: 'string', value: HTTP_CLIENT },
                  [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.node_fetch' },
                  'sentry.request.hook': { type: 'string', value: '/api/v1' },
                  'sentry.response.hook.path': { type: 'string', value: '/api/v1' },
                  'sentry.response.hook.status_code': { type: 'integer', value: 404 },
                  [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 404 },
                }),
              }),
            ]);
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
