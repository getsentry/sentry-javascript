import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should send manually started parallel root spans in root context', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const span1 = container.items.find(span => span.name === 'test_span_1');
        const span2 = container.items.find(span => span.name === 'test_span_2');
        expect(span1?.is_segment).toBe(true);
        expect(span2?.is_segment).toBe(true);
        expect(span1?.start_timestamp).toEqual(expect.any(Number));
        expect(span1?.end_timestamp).toEqual(expect.any(Number));

        // Both root spans continue the scope's propagation context, including the parentSpanId.
        expect(span1?.trace_id).toBe('12345678901234567890123456789012');
        expect(span1?.parent_span_id).toBe('1234567890123456');
        expect(span2?.parent_span_id).toBe('1234567890123456');

        expect(span2?.trace_id).toBe(span1?.trace_id);
        expect(span2?.attributes.spanIdTraceId).toEqual({ type: 'string', value: span1?.trace_id });
      },
    })
    .start()
    .completed();
});
