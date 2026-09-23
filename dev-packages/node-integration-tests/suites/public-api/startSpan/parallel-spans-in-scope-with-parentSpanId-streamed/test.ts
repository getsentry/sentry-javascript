import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('sends manually started streamed parallel root spans outside of root context with parentSpanId', async () => {
  expect.assertions(6);

  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: spanContainer => {
        expect(spanContainer).toBeDefined();

        const span1 = spanContainer.items.find(item => item.name === 'test_span_1');
        const span2 = spanContainer.items.find(item => item.name === 'test_span_2');
        expect(span1).toBeDefined();
        expect(span2).toBeDefined();

        // Both root spans continue the scope's propagation context, including the parentSpanId,
        // matching the core SDK behavior.
        expect(span1!.trace_id).toBe('12345678901234567890123456789012');
        expect(span1!.parent_span_id).toBe('1234567890123456');

        // Same trace ID for both spans
        expect(span2!.trace_id).toBe(span1!.trace_id);
      },
    })
    .start()
    .completed();
});
