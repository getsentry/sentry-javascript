import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should set extras from multiple consecutive calls', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'consecutive_calls',
        extra: { extra: [], Infinity: 2, null: 0, obj: { foo: ['bar', 'baz', 1] } },
      },
    })
    .start()
    .completed();
});
