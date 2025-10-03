import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should record multiple contexts', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'multiple_contexts',
        contexts: {
          context_1: {
            foo: 'bar',
            baz: { qux: 'quux' },
          },
          context_2: { 1: 'foo', bar: false },
        },
      },
    })
    .start()
    .completed();
});
