import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('proxies sentry requests', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'basic.js')
    .withMockSentryServer()
    .expect({
      event: {
        message: 'Hello, via proxy!',
      },
    })
    .start()
    .completed();
});
