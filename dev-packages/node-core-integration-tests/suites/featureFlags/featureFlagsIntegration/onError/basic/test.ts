import { _INTERNAL_FLAG_BUFFER_SIZE as FLAG_BUFFER_SIZE } from '@sentry/core';
import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('Flags captured on error with eviction, update, and no async tasks', async () => {
  // Based on scenario.ts.
  const expectedFlags = [{ flag: 'feat2', result: false }];
  for (let i = 4; i <= FLAG_BUFFER_SIZE; i++) {
    expectedFlags.push({ flag: `feat${i}`, result: false });
  }
  expectedFlags.push({ flag: `feat${FLAG_BUFFER_SIZE + 1}`, result: true });
  expectedFlags.push({ flag: 'feat3', result: true });

  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        exception: { values: [{ type: 'Error', value: 'Test error' }] },
        contexts: {
          flags: {
            values: expectedFlags,
          },
        },
      },
    })
    .start()
    .completed();
});
