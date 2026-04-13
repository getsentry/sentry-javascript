import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('sends manually started streamed parallel root spans in root context', async () => {
  expect.assertions(7);

  await createRunner(__dirname, 'scenario.ts')
    .expect({ span: { items: [{ name: 'test_span_1' }] } })
    .expect({
      span: spanContainer => {
        expect(spanContainer).toBeDefined();
        const traceId = spanContainer.items[0]!.trace_id;
        expect(traceId).toMatch(/^[0-9a-f]{32}$/);

        // It ignores propagation context of the root context
        expect(traceId).not.toBe('12345678901234567890123456789012');
        expect(spanContainer.items[0]!.parent_span_id).toBeUndefined();

        // Different trace ID than the first span
        const trace1Id = spanContainer.items[0]!.attributes?.spanIdTraceId?.value;
        expect(trace1Id).toMatch(/^[0-9a-f]{32}$/);

        expect(trace1Id).not.toBe(traceId);
      },
    })
    .start()
    .completed();
});
