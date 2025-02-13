import { createRunner } from '../../../utils/runner';

describe('span links', () => {
  test('should link spans with addLink() in trace context', done => {
    let span1_traceId: string, span1_spanId: string;

    createRunner(__dirname, 'scenario-addLink.ts')
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
      .start(done);
  });

  test('should link spans with addLinks() in trace context', done => {
    let span1_traceId: string, span1_spanId: string, span2_traceId: string, span2_spanId: string;

    createRunner(__dirname, 'scenario-addLinks.ts')
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
      .start(done);
  });

  test('should link spans with addLink() in nested startSpan() calls', done => {
    createRunner(__dirname, 'scenario-addLink-nested.ts')
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
      .start(done);
  });

  test('should link spans with addLinks() in nested startSpan() calls', done => {
    createRunner(__dirname, 'scenario-addLinks-nested.ts')
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
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-expect-error traceID is defined
              trace_id: expect.stringMatching(child1_1?.trace_id),
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-expect-error spanID is defined
              span_id: expect.stringMatching(child1_1?.span_id),
              attributes: expect.objectContaining({
                'sentry.link.type': 'previous_trace',
              }),
            }),
          ]);
        },
      })
      .start(done);
  });
});
