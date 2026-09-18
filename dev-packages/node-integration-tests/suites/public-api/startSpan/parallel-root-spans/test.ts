import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should send manually started parallel root spans in root context', async () => {
  expect.assertions(6);

  await createRunner(__dirname, 'scenario.ts')
    .expect({ transaction: { transaction: 'test_span_1' } })
    .expect({
      transaction: transaction => {
        expect(transaction).toBeDefined();
        const traceId = transaction.contexts?.trace?.trace_id;

        // Both root spans continue the scope's propagation context, matching the core SDK behavior.
        expect(traceId).toBe('12345678901234567890123456789012');
        expect(transaction.contexts?.trace?.parent_span_id).toBe('1234567890123456');

        // Same trace ID as the first span
        const trace1Id = transaction.contexts?.trace?.data?.spanIdTraceId;
        expect(trace1Id).toBe('12345678901234567890123456789012');
        expect(trace1Id).toBe(traceId);
      },
    })
    .start()
    .completed();
});
