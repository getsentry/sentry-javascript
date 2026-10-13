import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('Dedupe integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('drops an event that duplicates the event captured right before it', async () => {
    await createRunner(__dirname, 'scenario.ts')
      .unignore('client_report')
      // Event processing is async, so on Bun a later event can be sent before an earlier one.
      .unordered()
      .expect({ event: { exception: { values: [{ type: 'Error', value: 'duplicate error' }] } } })
      .expect({ event: { message: 'duplicate message' } })
      // Same error as the first event, but not a duplicate of the message event right before it.
      .expect({ event: { exception: { values: [{ type: 'Error', value: 'duplicate error' }] } } })
      .expect({
        client_report: {
          discarded_events: [{ category: 'error', quantity: 2, reason: 'event_processor' }],
        },
      })
      .start()
      .completed();
  });

  test('sends duplicate events when the integration is removed', async () => {
    await createRunner(__dirname, 'scenario-without-dedupe.ts')
      .expect({ event: { exception: { values: [{ type: 'Error', value: 'duplicate error' }] } } })
      .expect({ event: { exception: { values: [{ type: 'Error', value: 'duplicate error' }] } } })
      .start()
      .completed();
  });
});
