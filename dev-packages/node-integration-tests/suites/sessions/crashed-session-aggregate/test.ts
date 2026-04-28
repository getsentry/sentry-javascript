import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should aggregate successful and crashed sessions', async () => {
  const runner = createRunner(__dirname, '..', 'server.ts')
    .ignore('transaction', 'event')
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
        expect(totals).toEqual({ exited: 2, errored: 0, crashed: 1 });
      },
    })
    .start();

  runner.makeRequest('get', '/test/success');
  runner.makeRequest('get', '/test/error_unhandled', { expectError: true });
  runner.makeRequest('get', '/test/success_next');
  await runner.completed();
});
