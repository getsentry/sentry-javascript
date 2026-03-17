import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
} from '@sentry/core';
import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('sends a streamed span envelope with correct envelope header', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expectHeader({
      span: {
        sent_at: expect.any(String),
        sdk: {
          name: 'sentry.javascript.node',
          version: SDK_VERSION,
        },
        trace: expect.objectContaining({
          public_key: 'public',
          sample_rate: '1',
          sampled: 'true',
          trace_id: expect.stringMatching(/^[\da-f]{32}$/),
          transaction: 'test-span',
        }),
      },
    })
    .start()
    .completed();
});

test('sends a streamed span envelope with correct spans for a manually started span with children', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const spans = container.items;
        expect(spans.length).toBe(4);

        const segmentSpan = spans.find(s => !!s.is_segment);
        expect(segmentSpan).toBeDefined();

        const segmentSpanId = segmentSpan!.span_id;
        const traceId = segmentSpan!.trace_id;

        const childSpan = spans.find(s => s.name === 'test-child-span');
        expect(childSpan).toBeDefined();
        expect(childSpan).toEqual({
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
              type: 'string',
              value: 'test-child',
            },
            [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.node' },
            [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
            [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpanId },
            [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: { type: 'string', value: 'test-span' },
            [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { type: 'string', value: '1.0.0' },
          },
          name: 'test-child-span',
          is_segment: false,
          parent_span_id: segmentSpanId,
          trace_id: traceId,
          span_id: expect.stringMatching(/^[\da-f]{16}$/),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          status: 'ok',
        });

        const inactiveSpan = spans.find(s => s.name === 'test-inactive-span');
        expect(inactiveSpan).toBeDefined();
        expect(inactiveSpan).toEqual({
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.node' },
            [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
            [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpanId },
            [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: { type: 'string', value: 'test-span' },
            [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { type: 'string', value: '1.0.0' },
          },
          links: [
            {
              attributes: {
                'sentry.link.type': {
                  type: 'string',
                  value: 'some_relation',
                },
              },
              sampled: true,
              span_id: segmentSpanId,
              trace_id: traceId,
            },
          ],
          name: 'test-inactive-span',
          is_segment: false,
          parent_span_id: segmentSpanId,
          trace_id: traceId,
          span_id: expect.stringMatching(/^[\da-f]{16}$/),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          status: 'ok',
        });

        const manualSpan = spans.find(s => s.name === 'test-manual-span');
        expect(manualSpan).toBeDefined();
        expect(manualSpan).toEqual({
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.node' },
            [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
            [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpanId },
            [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: { type: 'string', value: 'test-span' },
            [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { type: 'string', value: '1.0.0' },
          },
          name: 'test-manual-span',
          is_segment: false,
          parent_span_id: segmentSpanId,
          trace_id: traceId,
          span_id: expect.stringMatching(/^[\da-f]{16}$/),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          status: 'ok',
        });

        expect(segmentSpan).toEqual({
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'test' },
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
            [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.node' },
            [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
            [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpanId },
            [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: { type: 'string', value: 'test-span' },
            [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { type: 'string', value: '1.0.0' },
          },
          name: 'test-span',
          is_segment: true,
          trace_id: traceId,
          span_id: segmentSpanId,
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          status: 'ok',
        });
      },
    })
    .start()
    .completed();
});
