import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture a simple message string', async () => {
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
