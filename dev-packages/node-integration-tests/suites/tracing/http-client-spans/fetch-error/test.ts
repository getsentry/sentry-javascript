import { HTTP_CLIENT } from '@sentry/conventions/op';
import { SENTRY_OP, SENTRY_ORIGIN, URL_FULL } from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('outgoing fetch spans - error', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures an errored span for a failed outgoing fetch request', async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('test_transaction');
            expect(container.items.filter(span => !span.is_segment)).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  name: 'GET localhost',
                  status: 'error',
                  attributes: expect.objectContaining({
                    [URL_FULL]: { type: 'string', value: expect.stringMatching(/http:\/\/localhost:\d+\//) },
                    [SENTRY_OP]: { type: 'string', value: HTTP_CLIENT },
                    [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.node_fetch' },
                  }),
                }),
              ]),
            );
          },
        })
        .start()
        .completed();
    });
  });
});
