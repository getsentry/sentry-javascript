import { SENTRY_SEGMENT_ID } from '@sentry/conventions/attributes';
import { describe, expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

describe('span links', () => {
  test('should link spans by adding "links" to span options', async () => {
    await createRunner(__dirname, 'scenario-span-options.ts')
      .expect({
        span: container => {
          const parent1 = container.items.find(span => span.is_segment && span.name === 'parent1');
          expect(parent1).toBeDefined();

          const parent2 = container.items.find(span => span.is_segment && span.name === 'parent2');
          expect(parent2).toBeDefined();

          expect(parent2?.links).toEqual([
            {
              trace_id: parent1?.trace_id,
              span_id: parent1?.span_id,
              sampled: true,
              attributes: { 'sentry.link.type': { type: 'string', value: 'previous_trace' } },
            },
          ]);
        },
      })
      .start()
      .completed();
  });

  test('should link spans with addLink() in trace context', async () => {
    await createRunner(__dirname, 'scenario-addLink.ts')
      .expect({
        span: container => {
          const span1 = container.items.find(span => span.is_segment && span.name === 'span1');
          expect(span1).toBeDefined();

          expect(
            container.items.filter(
              span => !span.is_segment && span.attributes[SENTRY_SEGMENT_ID]?.value === span1?.span_id,
            ),
          ).toEqual([]);

          const rootSpan = container.items.find(span => span.is_segment && span.name === 'rootSpan');
          expect(rootSpan).toBeDefined();

          expect(rootSpan?.links).toEqual([
            {
              trace_id: span1?.trace_id,
              span_id: span1?.span_id,
              sampled: true,
              attributes: {
                'sentry.link.type': { type: 'string', value: 'previous_trace' },
              },
            },
          ]);
        },
      })
      .start()
      .completed();
  });

  test('should link spans with addLinks() in trace context', async () => {
    await createRunner(__dirname, 'scenario-addLinks.ts')
      .expect({
        span: container => {
          const span1 = container.items.find(span => span.is_segment && span.name === 'span1');
          expect(span1).toBeDefined();

          expect(
            container.items.filter(
              span => !span.is_segment && span.attributes[SENTRY_SEGMENT_ID]?.value === span1?.span_id,
            ),
          ).toEqual([]);

          const span2 = container.items.find(span => span.is_segment && span.name === 'span2');
          expect(span2).toBeDefined();

          expect(
            container.items.filter(
              span => !span.is_segment && span.attributes[SENTRY_SEGMENT_ID]?.value === span2?.span_id,
            ),
          ).toEqual([]);

          const rootSpan = container.items.find(span => span.is_segment && span.name === 'rootSpan');
          expect(rootSpan).toBeDefined();

          expect(rootSpan?.links).toEqual([
            {
              trace_id: span1?.trace_id,
              span_id: span1?.span_id,
              sampled: true,
              attributes: {},
            },
            {
              trace_id: span2?.trace_id,
              span_id: span2?.span_id,
              sampled: true,
              attributes: {
                'sentry.link.type': { type: 'string', value: 'previous_trace' },
              },
            },
          ]);
        },
      })
      .start()
      .completed();
  });

  test('should link spans with addLink() in nested startSpan() calls', async () => {
    await createRunner(__dirname, 'scenario-addLink-nested.ts')
      .expect({
        span: container => {
          const parent1 = container.items.find(span => span.is_segment && span.name === 'parent1');
          expect(parent1).toBeDefined();

          const spans = container.items.filter(span => !span.is_segment);
          const child1_1 = spans.find(span => span.name === 'child1.1');
          const child1_2 = spans.find(span => span.name === 'child1.2');

          expect(child1_1).toBeDefined();
          expect(child1_1?.links).toEqual([
            {
              trace_id: parent1?.trace_id,
              span_id: parent1?.span_id,
              sampled: true,
              attributes: {
                'sentry.link.type': { type: 'string', value: 'previous_trace' },
              },
            },
          ]);

          expect(child1_2).toBeDefined();
          expect(child1_2?.links).toEqual([
            {
              trace_id: parent1?.trace_id,
              span_id: parent1?.span_id,
              sampled: true,
              attributes: {
                'sentry.link.type': { type: 'string', value: 'previous_trace' },
              },
            },
          ]);
        },
      })
      .start()
      .completed();
  });

  test('should link spans with addLinks() in nested startSpan() calls', async () => {
    await createRunner(__dirname, 'scenario-addLinks-nested.ts')
      .expect({
        span: container => {
          const parent1 = container.items.find(span => span.is_segment && span.name === 'parent1');
          expect(parent1).toBeDefined();

          const spans = container.items.filter(span => !span.is_segment);
          const child1_1 = spans.find(span => span.name === 'child1.1');
          const child2_1 = spans.find(span => span.name === 'child2.1');

          expect(child1_1).toBeDefined();

          expect(child2_1).toBeDefined();

          expect(child2_1?.links).toEqual([
            {
              trace_id: parent1?.trace_id,
              span_id: parent1?.span_id,
              sampled: true,
              attributes: {},
            },
            {
              trace_id: child1_1?.trace_id,
              span_id: child1_1?.span_id,
              sampled: true,
              attributes: {
                'sentry.link.type': { type: 'string', value: 'previous_trace' },
              },
            },
          ]);
        },
      })
      .start()
      .completed();
  });
});
