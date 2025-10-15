import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should set primitive tags', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'primitive_tags',
        tags: {
          tag_1: 'foo',
          tag_2: 3.141592653589793,
          tag_3: false,
          tag_4: null,
          tag_6: -1,
        },
      },
    })
    .start()
    .completed();
});
