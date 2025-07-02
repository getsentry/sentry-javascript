import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('proxies sentry requests', async () => {
  await createRunner(__dirname, 'basic.js')
    .withMockSentryServer()
    .expect({
      event: {
        message: 'Hello, via proxy!',
      },
    })
    .start()
    .completed();
});
