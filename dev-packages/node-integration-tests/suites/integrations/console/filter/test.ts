import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('Console Integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('filters console messages', async () => {
      await createRunner()
        .expect({
          event: {
            exception: {
              values: [
                {
                  value: 'Test Error',
                },
              ],
            },
            breadcrumbs: [
              expect.objectContaining({
                message: 'hello',
              }),
              expect.objectContaining({
                message: 'baz',
              }),
            ],
          },
        })
        .start()
        .completed();
    });
  });
});
