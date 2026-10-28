import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

const REPEATED_INIT_WARNING = '`Sentry.init()` was called more than once';

test('warns on a repeated init and sends events with the new client', async () => {
  const runner = createRunner(__dirname, 'scenario-repeated.ts')
    .expect({ event: { message: 'after repeated init', release: '2.0' } })
    .start();

  await runner.completed();

  expect(runner.getLogs().join('\n')).toContain(REPEATED_INIT_WARNING);
});

test('does not warn on init after close and sends events with the new client', async () => {
  const runner = createRunner(__dirname, 'scenario-close.ts')
    .expect({ event: { message: 'after close and init', release: '2.0' } })
    .start();

  await runner.completed();

  expect(runner.getLogs().join('\n')).not.toContain(REPEATED_INIT_WARNING);
});

test('does not warn on init after close in a child scope', async () => {
  const runner = createRunner(__dirname, 'scenario-close-in-scope.ts')
    .expect({ event: { message: 'after close in a child scope and init', release: '2.0' } })
    .start();

  await runner.completed();

  expect(runner.getLogs().join('\n')).not.toContain(REPEATED_INIT_WARNING);
});
