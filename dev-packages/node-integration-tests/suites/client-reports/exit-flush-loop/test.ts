import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('exits when client reports are flushed on `beforeExit` without the SDK owning the OpenTelemetry setup', async () => {
  const runner = createRunner(__dirname, 'scenario.ts').withMockSentryServer().start();

  await new Promise(resolve => setTimeout(resolve, 5_000));

  expect(runner.getLogs()).not.toContain("I'm alive!");
  expect(runner.childHasExited()).toBe(true);
});
