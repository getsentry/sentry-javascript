import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should unset user', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({ event: { message: 'no_user' } })
    .expect({
      event: {
        message: 'user',
        user: {
          id: 'foo',
          ip_address: 'bar',
          other_key: 'baz',
        },
      },
    })
    .expect({ event: { message: 'unset_user' } })
    .start()
    .completed();
});
