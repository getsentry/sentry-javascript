import { SENTRY_SEGMENT_ID } from '@sentry/conventions/attributes';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('bindScopeToEmitter preserves the active span for listeners firing in a different async context', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const parent = container.items.find(span => span.name === 'parent');
        const childUnbound = container.items.find(span => span.name === 'child-unbound');

        expect(parent?.is_segment).toBe(true);
        expect(childUnbound?.is_segment).toBe(true);

        const parentTraceId = parent?.trace_id;
        const parentSpanId = parent?.span_id;

        // The bound emitter's listener ran inside the parent span context -> nested child span.
        const childBound = container.items.find(span => span.name === 'child-bound');
        expect(childBound?.is_segment).toBe(false);
        expect(childBound?.parent_span_id).toBe(parentSpanId);
        expect(childBound?.trace_id).toBe(parentTraceId);

        // The unbound emitter's listener ran without the parent active -> its own root span,
        // not nested under the parent span. It still shares the isolation scope's propagation context
        // trace, matching the core SDK behavior for root spans.
        expect(
          container.items.filter(
            span => !span.is_segment && span.attributes[SENTRY_SEGMENT_ID]?.value === childUnbound?.span_id,
          ),
        ).toEqual([]);
        expect(childUnbound?.parent_span_id).toBeUndefined();
      },
    })
    .start()
    .completed();
});
