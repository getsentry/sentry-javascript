import { afterAll, test } from 'vitest';
import { join } from 'path';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('sends a process session for a process that does not serve requests', async () => {
  await createRunner(__dirname, 'scenario.mjs')
    .withInstrument(join(__dirname, 'instrument.mjs'))
    .ignore('event')
    .unignore('session')
    .expect({ session: { init: true, status: 'ok', errors: 1 } })
    .expect({ session: { init: false, status: 'exited', errors: 1 } })
    .start()
    .completed();
});
