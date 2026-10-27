import { afterAll, expect, test } from 'vitest';
import { join } from 'path';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('does not count errors dropped by ignoreErrors or beforeSend', async () => {
  const runner = createRunner(__dirname, '..', 'server.mjs')
    .withInstrument(join(__dirname, '..', 'instrument.mjs'))
    .ignore('span', 'event')
    .unignore('sessions')
    .expect({
      sessions: agg => {
        // Sessions are bucketed by minute; tolerate splits across a minute boundary by summing.
        const totals = agg.aggregates.reduce(
          (acc, b) => ({
            exited: acc.exited + (b.exited ?? 0),
            errored: acc.errored + (b.errored ?? 0),
            crashed: acc.crashed + (b.crashed ?? 0),
          }),
          { exited: 0, errored: 0, crashed: 0 },
        );
        expect(totals).toEqual({ exited: 2, errored: 0, crashed: 0 });
      },
    })
    .start();

  runner.makeRequest('get', '/test/error_ignored', { expectError: true });
  runner.makeRequest('get', '/test/error_dropped');
  await runner.completed();
});
