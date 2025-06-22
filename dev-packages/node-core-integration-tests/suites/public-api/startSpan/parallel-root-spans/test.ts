import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should send manually started parallel root spans in root context', async () => {
  expect.assertions(7);

  await createRunner(__dirname, 'scenario.ts')
    .expect({ transaction: { transaction: 'test_span_1' } })
    .expect({
      transaction: transaction => {
        expect(transaction).toBeDefined();
        const traceId = transaction.contexts?.trace?.trace_id;
        expect(traceId).toBeDefined();

        // It ignores propagation context of the root context
        expect(traceId).not.toBe('12345678901234567890123456789012');
        expect(transaction.contexts?.trace?.parent_span_id).toBeUndefined();

        // Different trace ID than the first span
        const trace1Id = transaction.contexts?.trace?.data?.spanIdTraceId;
        expect(trace1Id).toBeDefined();
        expect(trace1Id).not.toBe(traceId);
      },
    })
    .start()
    .completed();
});
