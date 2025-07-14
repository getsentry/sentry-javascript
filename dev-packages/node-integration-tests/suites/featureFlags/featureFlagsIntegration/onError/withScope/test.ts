import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('Flags captured on error are isolated by current scope', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        exception: { values: [{ type: 'Error', value: 'Error in forked scope' }] },
        contexts: {
          flags: {
            values: [
              { flag: 'forked', result: true },
              { flag: 'shared', result: false },
            ],
          },
        },
      },
    })
    .expect({
      event: {
        exception: { values: [{ type: 'Error', value: 'Error in main scope' }] },
        contexts: {
          flags: {
            values: [
              { flag: 'shared', result: true },
              { flag: 'main', result: true },
            ],
          },
        },
      },
    })
    .start()
    .completed();
});
