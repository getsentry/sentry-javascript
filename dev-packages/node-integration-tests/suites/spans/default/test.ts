import { expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

test('sends spans with correct properties', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: spanContainer => {
        const spans = spanContainer.items;
        expect(spans).toHaveLength(3);

        const segmentSpanId = spans.find(span => span.is_segment)?.span_id;
        expect(segmentSpanId).toMatch(/^[\da-f]{16}$/);

        const childSpanId = spans.find(span => span.name === 'child')?.span_id;
        expect(childSpanId).toMatch(/^[\da-f]{16}$/);

        const traceId = spans.find(span => span.is_segment)?.trace_id;
        expect(traceId).toMatch(/^[\da-f]{32}$/);

        expect(spans).toEqual([
          {
            end_timestamp: expect.any(Number),
            is_segment: false,
            name: 'grandchild_new_name',
            parent_span_id: childSpanId,
            span_id: expect.stringMatching(/^[\da-f]{16}$/),
            start_timestamp: expect.any(Number),
            status: 'ok',
            trace_id: traceId,
            attributes: {
              scope_attr: {
                type: 'integer',
                unit: 'millisecond',
                value: 100,
              },
              'sentry.custom_span_name': {
                type: 'string',
                value: 'grandchild_new_name',
              },
              'sentry.origin': {
                type: 'string',
                value: 'manual',
              },
              'sentry.release': {
                type: 'string',
                value: '1.0',
              },
              'sentry.sdk.name': {
                type: 'string',
                value: 'sentry.javascript.node',
              },
              'sentry.sdk.version': {
                type: 'string',
                value: expect.any(String),
              },
              'sentry.segment.id': {
                type: 'string',
                value: segmentSpanId,
              },
              'sentry.segment.name': {
                type: 'string',
                value: 'parent',
              },
              'sentry.source': {
                type: 'string',
                value: 'custom',
              },
              'sentry.span.source': {
                type: 'string',
                value: 'custom',
              },
            },
          },
          {
            end_timestamp: expect.any(Number),
            is_segment: false,
            name: 'child',
            parent_span_id: segmentSpanId,
            span_id: childSpanId,
            start_timestamp: expect.any(Number),
            status: 'ok',
            trace_id: traceId,
            links: [
              {
                attributes: {
                  child_link_attr: {
                    type: 'string',
                    value: 'hi',
                  },
                },
                sampled: true,
                span_id: segmentSpanId,
                traceState: {
                  _internalState: {},
                },
                trace_id: traceId,
              },
            ],
            attributes: {
              scope_attr: {
                type: 'integer',
                unit: 'millisecond',
                value: 100,
              },
              'sentry.origin': {
                type: 'string',
                value: 'manual',
              },
              'sentry.release': {
                type: 'string',
                value: '1.0',
              },
              'sentry.sdk.name': {
                type: 'string',
                value: 'sentry.javascript.node',
              },
              'sentry.sdk.version': {
                type: 'string',
                value: expect.any(String),
              },
              'sentry.segment.id': {
                type: 'string',
                value: segmentSpanId,
              },
              'sentry.segment.name': {
                type: 'string',
                value: 'parent',
              },
              'sentry.source': {
                type: 'string',
                value: 'custom',
              },
              'sentry.span.source': {
                type: 'string',
                value: 'custom',
              },
            },
          },
          {
            end_timestamp: expect.any(Number),
            is_segment: true,
            name: 'parent',
            span_id: segmentSpanId,
            start_timestamp: expect.any(Number),
            status: 'ok',
            trace_id: traceId,
            attributes: {
              parent_span_attr: {
                type: 'boolean',
                value: true,
              },
              scope_attr: {
                type: 'integer',
                unit: 'millisecond',
                value: 100,
              },
              'sentry.origin': {
                type: 'string',
                value: 'manual',
              },
              'sentry.release': {
                type: 'string',
                value: '1.0',
              },
              'sentry.sample_rate': {
                type: 'integer',
                value: 1,
              },
              'sentry.sdk.name': {
                type: 'string',
                value: 'sentry.javascript.node',
              },
              'sentry.sdk.version': {
                type: 'string',
                value: expect.any(String),
              },
              'sentry.segment.id': {
                type: 'string',
                value: segmentSpanId,
              },
              'sentry.segment.name': {
                type: 'string',
                value: 'parent',
              },
              'sentry.source': {
                type: 'string',
                value: 'custom',
              },
              'sentry.span.source': {
                type: 'string',
                value: 'custom',
              },
            },
          },
        ]);
      },
    })
    .start()
    .completed();
});
