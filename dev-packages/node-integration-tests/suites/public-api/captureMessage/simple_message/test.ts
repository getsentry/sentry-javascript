import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture a simple message string', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'Message',
        level: 'info',
      },
    })
    .start()
    .completed();
});
