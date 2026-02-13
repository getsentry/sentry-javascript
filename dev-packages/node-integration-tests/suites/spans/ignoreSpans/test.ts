import { expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

// eslint-disable-next-line @sentry-internal/sdk/no-skipped-tests
test.skip('ignoring a segment span drops the entire segment', async () => {
  // When the segment span matches ignoreSpans, all spans within that segment should be dropped
  // We verify this by having two segments - one ignored and one not - and checking only the non-ignored one is sent
  await createRunner(__dirname, 'scenario-ignore-segment.ts')
    .expect({
      span: spanContainer => {
        const spans = spanContainer.items;

        // We should only have spans from 'segment-to-keep' (2 spans: segment + child)
        // The 'segment-to-ignore' and all its children (3 spans) should NOT be sent
        expect(spans).toHaveLength(2);

        const spanNames = spans.map(span => span.name);

        // These should be present (from the non-ignored segment)
        expect(spanNames).toContain('segment-to-keep');
        expect(spanNames).toContain('child-of-kept-segment');

        // These should NOT be present (from the ignored segment)
        expect(spanNames).not.toContain('segment-to-ignore');
        expect(spanNames).not.toContain('child-of-ignored-segment');
        expect(spanNames).not.toContain('grandchild-of-ignored-segment');

        // Verify the segment span
        const segmentSpan = spans.find(span => span.is_segment);
        expect(segmentSpan).toBeDefined();
        expect(segmentSpan?.name).toBe('segment-to-keep');
      },
    })
    .expect({
      client_report: {
        discarded_events: [{ category: 'span', reason: 'event_processor', quantity: 3 }],
      },
    })
    .start()
    .completed();
});

// eslint-disable-next-line @sentry-internal/sdk/no-skipped-tests
test.skip('ignoring a child span only drops that child span', async () => {
  await createRunner(__dirname, 'scenario-ignore-child.ts')
    .expect({
      span: spanContainer => {
        const spans = spanContainer.items;

        expect(spans).toHaveLength(3);

        const spanNames = spans.map(span => span.name);
        expect(spanNames).toContain('parent');
        expect(spanNames).toContain('child-to-keep');
        expect(spanNames).toContain('child-of-ignored-child');
        expect(spanNames).not.toContain('child-to-ignore');

        const segmentSpan = spans.find(span => span.is_segment);
        expect(segmentSpan).toBeDefined();
        expect(segmentSpan?.name).toBe('parent');

        // Verify the child spans to be kept are the children of the dropped span's parent
        const childSpan = spans.find(span => span.name === 'child-to-keep');
        expect(childSpan).toBeDefined();
        expect(childSpan?.is_segment).toBe(false);
        expect(childSpan?.parent_span_id).toBe(segmentSpan?.span_id);

        const childOfIgnoredChildSpan = spans.find(span => span.name === 'child-of-ignored-child');
        expect(childOfIgnoredChildSpan).toBeDefined();
        expect(childOfIgnoredChildSpan?.is_segment).toBe(false);
        expect(childOfIgnoredChildSpan?.parent_span_id).toBe(segmentSpan?.span_id);
      },
    })
    .expect({
      client_report: {
        discarded_events: [{ category: 'span', reason: 'event_processor', quantity: 1 }],
      },
    })
    .start()
    .completed();
});
