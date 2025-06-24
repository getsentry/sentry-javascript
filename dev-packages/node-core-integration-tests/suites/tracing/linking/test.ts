import { describe, expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

describe('span links', () => {
  test('should link spans by adding "links" to span options', async () => {
    let span1_traceId: string, span1_spanId: string;

    await createRunner(__dirname, 'scenario-span-options.ts')
      .expect({
        transaction: event => {
          expect(event.transaction).toBe('parent1');

          const traceContext = event.contexts?.trace;
          span1_traceId = traceContext?.trace_id as string;
          span1_spanId = traceContext?.span_id as string;
        },
      })
      .expect({
        transaction: event => {
          expect(event.transaction).toBe('parent2');

          const traceContext = event.contexts?.trace;
          expect(traceContext).toBeDefined();
          expect(traceContext?.links).toEqual([
            expect.objectContaining({
              trace_id: expect.stringMatching(span1_traceId),
              span_id: expect.stringMatching(span1_spanId),
            }),
          ]);
        },
      })
      .start()
      .completed();
  });

  test('should link spans with addLink() in trace context', async () => {
    let span1_traceId: string, span1_spanId: string;

    await createRunner(__dirname, 'scenario-addLink.ts')
      .expect({
        transaction: event => {
          expect(event.transaction).toBe('span1');

          span1_traceId = event.contexts?.trace?.trace_id as string;
          span1_spanId = event.contexts?.trace?.span_id as string;

          expect(event.spans).toEqual([]);
        },
      })
      .expect({
        transaction: event => {
          expect(event.transaction).toBe('rootSpan');

          expect(event.contexts?.trace?.links).toEqual([
            expect.objectContaining({
              trace_id: expect.stringMatching(span1_traceId),
              span_id: expect.stringMatching(span1_spanId),
              attributes: expect.objectContaining({
                'sentry.link.type': 'previous_trace',
              }),
            }),
          ]);
        },
      })
      .start()
      .completed();
  });

  test('should link spans with addLinks() in trace context', async () => {
    let span1_traceId: string, span1_spanId: string, span2_traceId: string, span2_spanId: string;

    await createRunner(__dirname, 'scenario-addLinks.ts')
      .expect({
        transaction: event => {
          expect(event.transaction).toBe('span1');

          span1_traceId = event.contexts?.trace?.trace_id as string;
          span1_spanId = event.contexts?.trace?.span_id as string;

          expect(event.spans).toEqual([]);
        },
      })
      .expect({
        transaction: event => {
          expect(event.transaction).toBe('span2');

          span2_traceId = event.contexts?.trace?.trace_id as string;
          span2_spanId = event.contexts?.trace?.span_id as string;

          expect(event.spans).toEqual([]);
        },
      })
      .expect({
        transaction: event => {
          expect(event.transaction).toBe('rootSpan');

          expect(event.contexts?.trace?.links).toEqual([
            expect.not.objectContaining({ attributes: expect.anything() }) &&
              expect.objectContaining({
                trace_id: expect.stringMatching(span1_traceId),
                span_id: expect.stringMatching(span1_spanId),
              }),
            expect.objectContaining({
              trace_id: expect.stringMatching(span2_traceId),
              span_id: expect.stringMatching(span2_spanId),
              attributes: expect.objectContaining({
                'sentry.link.type': 'previous_trace',
              }),
            }),
          ]);
        },
      })
      .start()
      .completed();
  });

  test('should link spans with addLink() in nested startSpan() calls', async () => {
    await createRunner(__dirname, 'scenario-addLink-nested.ts')
      .expect({
        transaction: event => {
          expect(event.transaction).toBe('parent1');

          const parent1_traceId = event.contexts?.trace?.trace_id as string;
          const parent1_spanId = event.contexts?.trace?.span_id as string;

          const spans = event.spans || [];
          const child1_1 = spans.find(span => span.description === 'child1.1');
          const child1_2 = spans.find(span => span.description === 'child1.2');

          expect(child1_1).toBeDefined();
          expect(child1_1?.links).toEqual([
            expect.objectContaining({
              trace_id: expect.stringMatching(parent1_traceId),
              span_id: expect.stringMatching(parent1_spanId),
              attributes: expect.objectContaining({
                'sentry.link.type': 'previous_trace',
              }),
            }),
          ]);

          expect(child1_2).toBeDefined();
          expect(child1_2?.links).toEqual([
            expect.objectContaining({
              trace_id: expect.stringMatching(parent1_traceId),
              span_id: expect.stringMatching(parent1_spanId),
              attributes: expect.objectContaining({
                'sentry.link.type': 'previous_trace',
              }),
            }),
          ]);
        },
      })
      .start()
      .completed();
  });

  test('should link spans with addLinks() in nested startSpan() calls', async () => {
    await createRunner(__dirname, 'scenario-addLinks-nested.ts')
      .expect({
        transaction: event => {
          expect(event.transaction).toBe('parent1');

          const parent1_traceId = event.contexts?.trace?.trace_id as string;
          const parent1_spanId = event.contexts?.trace?.span_id as string;

          const spans = event.spans || [];
          const child1_1 = spans.find(span => span.description === 'child1.1');
          const child2_1 = spans.find(span => span.description === 'child2.1');

          expect(child1_1).toBeDefined();

          expect(child2_1).toBeDefined();

          expect(child2_1?.links).toEqual([
            expect.not.objectContaining({ attributes: expect.anything() }) &&
              expect.objectContaining({
                trace_id: expect.stringMatching(parent1_traceId),
                span_id: expect.stringMatching(parent1_spanId),
              }),
            expect.objectContaining({
              trace_id: expect.stringMatching(child1_1?.trace_id || 'non-existent-id-fallback'),
              span_id: expect.stringMatching(child1_1?.span_id || 'non-existent-id-fallback'),
              attributes: expect.objectContaining({
                'sentry.link.type': 'previous_trace',
              }),
            }),
          ]);
        },
      })
      .start()
      .completed();
  });
});
