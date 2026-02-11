import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should flush client reports automatically after the timeout interval', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .unignore('client_report')
    .expect({
      client_report: {
        discarded_events: [
          {
            category: 'error',
            quantity: 1,
            reason: 'before_send',
          },
        ],
      },
    })
    .start()
    .completed();
});
