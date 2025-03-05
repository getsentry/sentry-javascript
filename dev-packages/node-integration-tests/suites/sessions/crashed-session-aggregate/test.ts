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
      sessions: {
        aggregates: [
          {
            started: expect.any(String),
            exited: 2,
            crashed: 1,
          },
        ],
      },
    })
    .start();

  runner.makeRequest('get', '/test/success');
  runner.makeRequest('get', '/test/error_unhandled', { expectError: true });
  runner.makeRequest('get', '/test/success_next');
  await runner.completed();
});
