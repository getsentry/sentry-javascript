import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should add an empty breadcrumb, when an empty object is given', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'test-empty-obj',
      },
    })
    .start()
    .completed();
});
