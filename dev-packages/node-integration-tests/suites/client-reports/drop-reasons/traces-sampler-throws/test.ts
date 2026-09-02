import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('records a client report and no error event when tracesSampler throws', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .unignore('client_report')
    .expect({
      client_report: {
        discarded_events: [
          {
            category: 'span',
            quantity: 1,
            reason: 'sample_rate',
          },
        ],
      },
    })
    .start()
    .completed();
});

test('sends the span when tracesSampler throws but tracesSampleRate is 1', async () => {
  await createRunner(__dirname, 'scenario-fallback.ts')
    .expect({
      transaction: {
        transaction: 'sampled via tracesSampleRate fallback',
      },
    })
    .start()
    .completed();
});
