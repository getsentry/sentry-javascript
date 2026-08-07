import * as path from 'path';
import { afterAll, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

// The runtime module hook needs Node >= 18.19; gate on 20 to stay on the stable
// `Module.registerHooks` / `Channel.hasSubscribers` surface.
conditionalTest({ min: 20 })('orchestrion lazy channel registration', () => {
  // The scenario self-asserts (via `node:assert`) that a default channel
  // integration has NOT subscribed to its channel until the instrumented module
  // is loaded, then that it HAS once loaded. A violation throws, which
  // `ensureNoErrorOutput` turns into a test failure.
  test('does not attach channel listeners until the module is loaded', async () => {
    await createRunner(__dirname, 'scenario.mjs')
      .withInstrument(path.join(__dirname, 'instrument.mjs'))
      .ensureNoErrorOutput()
      .start()
      .completed();
  });

  // A force-bundled module (vite SSR / nextjs bundle-safe packages) is never
  // loaded through the runtime hook, so it can only trigger subscription via
  // the module-injected snippet the bundler transform splices into it. The
  // scenario simulates that snippet and asserts the channel subscribes without
  // the module ever being loaded through the hook.
  test('subscribes for a bundler-announced module via the module-injected snippet', async () => {
    await createRunner(__dirname, 'scenario-bundler.mjs')
      .withInstrument(path.join(__dirname, 'instrument.mjs'))
      .ensureNoErrorOutput()
      .start()
      .completed();
  });
});
