import { afterAll, expect, test } from 'vitest';
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
            reason: 'callback_error',
          },
        ],
      },
    })
    .start()
    .completed();
});

test('sends the span when tracesSampler throws but tracesSampleRate is 1', async () => {
  const runner = createRunner(__dirname, 'scenario-fallback.ts');
  const spansPromise = runner.collectStreamedSpansUntilSegment();

  await runner.start().completed();

  const spans = await spansPromise;
  const segment = spans.find(span => span.is_segment);
  expect(segment?.name).toBe('sampled via tracesSampleRate fallback');
});
