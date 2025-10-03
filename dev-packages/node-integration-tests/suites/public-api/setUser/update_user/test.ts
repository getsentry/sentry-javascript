import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should update user', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'first_user',
        user: {
          id: 'foo',
          ip_address: 'bar',
        },
      },
    })
    .expect({
      event: {
        message: 'second_user',
        user: {
          id: 'baz',
        },
      },
    })
    .start()
    .completed();
});
