import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should send client report for events dropped during async processing on close', async () => {
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
