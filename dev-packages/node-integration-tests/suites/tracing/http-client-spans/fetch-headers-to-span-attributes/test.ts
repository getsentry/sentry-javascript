import { HTTP_CLIENT } from '@sentry/conventions/op';
import {
  HTTP_RESPONSE_HEADER_CONTENT_LENGTH,
  SENTRY_OP,
  SENTRY_ORIGIN,
  URL_FULL,
} from '@sentry/conventions/attributes';
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
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('test_transaction');
            expect(container.items.filter(span => !span.is_segment)).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  name: 'GET localhost',
                  attributes: expect.objectContaining({
                    [URL_FULL]: { type: 'string', value: expect.stringMatching(/.*\/api\/v0/) },
                    [SENTRY_OP]: { type: 'string', value: HTTP_CLIENT },
                    [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.node_fetch' },
                    'http.request.header.x-test-header': { type: 'array', value: ['test-value'] },
                    // Listed in `headersToSpanAttributes`, but the built-in denylist still wins.
                    'http.request.header.authorization': { type: 'array', value: ['[Filtered]'] },
                    // Listed in `headersToSpanAttributes`, but denied via `dataCollection.httpHeaders`.
                    'http.request.header.x-tenant-id': { type: 'array', value: ['[Filtered]'] },
                    'http.response.header.x-powered-by': { type: 'array', value: ['Express'] },
                    [HTTP_RESPONSE_HEADER_CONTENT_LENGTH]: { type: 'array', value: ['[Filtered]'] },
                  }),
                }),
              ]),
            );
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
