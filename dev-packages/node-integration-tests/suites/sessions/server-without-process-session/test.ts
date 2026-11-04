import { afterAll, expect, test } from 'vitest';
import { join } from 'path';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';
import type { SessionAggregates } from '@sentry/core';

afterAll(() => {
  cleanupChildProcesses();
});

function sumAggregates(agg: SessionAggregates): { exited: number; errored: number; crashed: number } {
  return agg.aggregates.reduce(
    (acc, b) => ({
      exited: acc.exited + (b.exited ?? 0),
      errored: acc.errored + (b.errored ?? 0),
      crashed: acc.crashed + (b.crashed ?? 0),
    }),
    { exited: 0, errored: 0, crashed: 0 },
  );
}

test('does not send a process session once requests are tracked as request sessions', async () => {
  const runner = createRunner(__dirname, '..', 'server.mjs')
    .withInstrument(join(__dirname, '..', 'instrument.mjs'))
    .ignore('transaction', 'event')
    .unignore('session', 'sessions')
    .expect({
      sessions: agg => {
        expect(sumAggregates(agg)).toEqual({ exited: 1, errored: 1, crashed: 1 });
      },
    })
    .start();

  runner.makeRequest('get', '/test/success');
  runner.makeRequest('get', '/test/error_handled');
  runner.makeRequest('get', '/test/error_unhandled', { expectError: true });
  await runner.completed();
});

test('counts an error before the first request in the process session, and later errors in the aggregate', async () => {
  const runner = createRunner(__dirname, 'server-with-startup-error.mjs')
    .withInstrument(join(__dirname, '..', 'instrument.mjs'))
    .ignore('transaction', 'event')
    .unignore('session', 'sessions')
    .expect({ session: { init: true, status: 'ok', errors: 1 } })
    .expect({ session: { init: false, status: 'exited', errors: 1 } })
    .expect({
      sessions: agg => {
        expect(sumAggregates(agg)).toEqual({ exited: 1, errored: 1, crashed: 0 });
      },
    })
    .start();

  await runner.makeRequest('get', '/test/success');
  await runner.makeRequest('get', '/test/error_handled');
  await runner.completed();
});
