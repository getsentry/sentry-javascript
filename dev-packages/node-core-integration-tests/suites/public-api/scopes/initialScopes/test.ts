import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should apply scopes correctly', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'outer_before',
        extra: {
          aa: 'aa',
          bb: 'bb',
        },
      },
    })
    .expect({
      event: {
        message: 'inner',
        extra: {
          aa: 'aa',
          bb: 'bb',
          cc: 'cc',
        },
      },
    })
    .expect({
      event: {
        message: 'outer_after',
        extra: {
          aa: 'aa',
          bb: 'bb',
        },
      },
    })
    .start()
    .completed();
});
