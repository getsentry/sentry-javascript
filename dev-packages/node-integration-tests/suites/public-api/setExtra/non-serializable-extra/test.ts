import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should normalize non-serializable extra', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'non_serializable',
        extra: {},
      },
    })
    .start()
    .completed();
});
