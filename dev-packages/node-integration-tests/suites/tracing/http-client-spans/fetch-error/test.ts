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
          transaction: {
            transaction: 'test_transaction',
            spans: expect.arrayContaining([
              expect.objectContaining({
                description: expect.stringMatching(/GET http:\/\/localhost:\d+\//),
                op: 'http.client',
                origin: 'auto.http.node_fetch',
                status: 'internal_error',
              }),
            ]),
          },
        })
        .start()
        .completed();
    });
  });
});
