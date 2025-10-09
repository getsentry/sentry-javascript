import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should set a simple context', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'simple_context_object',
        contexts: {
          foo: {
            bar: 'baz',
          },
        },
      },
    })
    .start()
    .completed();
});
