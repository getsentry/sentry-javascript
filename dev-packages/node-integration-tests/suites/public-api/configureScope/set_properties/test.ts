import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should set different properties of a scope', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'configured_scope',
        tags: {
          foo: 'bar',
        },
        extra: {
          qux: 'quux',
        },
        user: {
          id: 'baz',
        },
      },
    })
    .start()
    .completed();
});
