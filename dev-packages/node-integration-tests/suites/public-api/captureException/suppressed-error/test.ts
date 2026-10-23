import { afterAll, describe, expect, test } from 'vitest';
import { supports } from '../../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe.runIf(supports({ min: 22 }))('SuppressedError', () => {
  test('captures both errors of a SuppressedError as chained exceptions', async () => {
    await createRunner(__dirname, 'scenario.ts')
      .expect({
        event: {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'original error',
                mechanism: { type: 'chained', source: 'suppressed', handled: true, exception_id: 2, parent_id: 0 },
              },
              {
                type: 'Error',
                value: 'error from dispose',
                mechanism: { type: 'chained', source: 'error', handled: true, exception_id: 1, parent_id: 0 },
              },
              {
                type: 'SuppressedError',
                value: expect.any(String),
                mechanism: { type: 'generic', handled: true, exception_id: 0 },
              },
            ],
          },
        },
      })
      .start()
      .completed();
  });
});
