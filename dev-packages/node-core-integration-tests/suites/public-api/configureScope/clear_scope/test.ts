import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should clear previously set properties of a scope', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'cleared_scope',
      },
    })
    .start()
    .completed();
});
