import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should record an extras object', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'multiple_extras',
        extra: {
          extra_1: [1, ['foo'], 'bar'],
          extra_2: 'baz',
          extra_3: 3.141592653589793,
          extra_4: { qux: { quux: false } },
        },
      },
    })
    .start()
    .completed();
});
