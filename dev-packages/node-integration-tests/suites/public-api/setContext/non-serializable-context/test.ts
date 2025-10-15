import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should normalize non-serializable context', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
    .expect({ event: { message: 'non_serializable', contexts: {} } })
    .start()
    .completed();
});
