import * as path from 'path';
import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('orchestrion registration-only modules at runtime', () => {
  // A registration-only config (a native-channel library such as `mysql2` >= 3.20)
  // carries the custom `MODULE_REGISTRATION_TRANSFORM`, which is wired into the
  // bundler plugins only. The runtime loader excludes these
  // (`SENTRY_RUNTIME_INSTRUMENTATIONS`), so loading such a module must not attempt
  // an unavailable transform — which would surface as `TypeError: transform is
  // not a function` and the always-on "`@sentry/server-runtime-injection` was
  // bundled ..." warning on stderr. `ensureNoErrorOutput` fails on any stderr.
  test('loads a native-channel library without the transformer-unavailable warning', async () => {
    await createRunner(__dirname, 'scenario.mjs')
      .withInstrument(path.join(__dirname, 'instrument.mjs'))
      .ensureNoErrorOutput()
      .start()
      .completed();
  });
});
