import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should send manually started parallel root spans outside of root context with parentSpanId', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({ transaction: { transaction: 'test_span_1' } })
    .expect({
      transaction: transaction => {
        expect(transaction).toBeDefined();
        const traceId = transaction.contexts?.trace?.trace_id;
        expect(traceId).toBeDefined();
        expect(transaction.contexts?.trace?.parent_span_id).toBeUndefined();

        const trace1Id = transaction.contexts?.trace?.data?.spanIdTraceId;
        expect(trace1Id).toBeDefined();

        // Different trace ID as the first span
        expect(trace1Id).not.toBe(traceId);
      },
    })
    .start(done);
});
