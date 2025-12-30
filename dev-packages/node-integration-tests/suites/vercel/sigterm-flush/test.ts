import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('flushes buffered events when SIGTERM is received on Vercel', async () => {
  const runner = createRunner(__dirname, 'scenario.ts')
    .withEnv({ VERCEL: '1' })
    .expect({
      event: {
        message: 'SIGTERM flush message',
      },
    })
    .start();

  // Wait for the scenario to signal it's ready (SIGTERM handler is registered).
  const waitForReady = async (): Promise<void> => {
    const maxWait = 10_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      if (runner.getLogs().some(line => line.includes('READY'))) {
        return;
      }
      await new Promise<void>(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for scenario to be ready');
  };

  await waitForReady();

  runner.sendSignal('SIGTERM');

  await runner.completed();

  // Check that the child didn't crash (it may be killed by the runner after completion).
  expect(runner.getLogs().join('\n')).not.toMatch(/Error starting child process/i);
});
