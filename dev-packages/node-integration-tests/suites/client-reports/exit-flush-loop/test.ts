import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('exits when client reports are flushed on `beforeExit` without the SDK owning the OpenTelemetry setup', async () => {
  // `ensureNoErrorOutput` is what separates a clean exit from a scenario that died on startup: both
  // leave the child exited, but only the latter writes to stderr.
  const runner = createRunner(__dirname, 'scenario.ts').withMockSentryServer().ensureNoErrorOutput().start();

  // The scenario exits as soon as its `beforeExit` flush settles, so polling for the child's own
  // exit keeps the passing run short. A flush loop that keeps re-arming `beforeExit` never exits
  // and runs into the deadline.
  const deadline = Date.now() + 10_000;
  while (!runner.childHasExited() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  expect(runner.childHasExited()).toBe(true);

  await runner.completed();
});
