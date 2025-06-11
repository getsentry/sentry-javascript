import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should record multiple extras of different types', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'multiple_extras',
        extra: {
          extra_1: { foo: 'bar', baz: { qux: 'quux' } },
          extra_2: false,
        },
      },
    })
    .start()
    .completed();
});
