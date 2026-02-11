import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('capture a simple message string with a stack trace if `attachStackTrace` is `true`', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'Message',
        level: 'info',
        exception: {
          values: [
            {
              mechanism: { synthetic: true, type: 'generic', handled: true },
              value: 'Message',
              stacktrace: { frames: expect.any(Array) },
            },
          ],
        },
      },
    })
    .start()
    .completed();
});
