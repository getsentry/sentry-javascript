import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should report finished spans as children of the root span.', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const segment = container.items.find(span => span.is_segment);
        // Streamed spans arrive in completion order; compare the original creation order.
        const spans = container.items
          .filter(span => !span.is_segment)
          .sort((a, b) => a.start_timestamp - b.start_timestamp);
        const rootSpanId = segment?.span_id;
        const span3Id = spans.find(span => span.name === 'span_3')?.span_id;

        expect(rootSpanId).toEqual(expect.any(String));
        expect(span3Id).toEqual(expect.any(String));

        expect(segment?.name).toBe('root_span');
        expect(segment?.start_timestamp).toEqual(expect.any(Number));
        expect(segment?.end_timestamp).toEqual(expect.any(Number));
        expect(spans).toMatchObject([
          {
            name: 'span_1',
            attributes: {
              foo: { type: 'string', value: 'bar' },
              baz: { type: 'array', value: [1, 2, 3] },
            },
            parent_span_id: rootSpanId,
          },
          {
            name: 'span_3',
            parent_span_id: rootSpanId,
          },
          {
            name: 'span_5',
            parent_span_id: span3Id,
          },
        ]);
      },
    })
    .start()
    .completed();
});
