import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('does not capture a stack trace if `attachStackTrace` is `false`', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: event => {
        expect(event.message).toBe('Message');
        expect(event.level).toBe('info');
        expect(event.exception).toBeUndefined();
      },
    })
    .start()
    .completed();
});
