import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/core';
import { SENTRY_LINK_TYPE, SENTRY_OP, SENTRY_ORIGIN, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { expect, test } from 'vitest';
import { EXPECTED_SDK_NAME } from '../../../../../utils';
import { assertSentryTransaction } from '../../../../../utils/assertions';
import { createRunner } from '../../../../../utils/runner';

test('sends a transaction envelope with correct envelope header', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expectHeader({
      transaction: {
        sent_at: expect.any(String),
        sdk: {
          name: EXPECTED_SDK_NAME,
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

test('sends a transaction with correct spans for a manually started span with children', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: transaction => {
        const rootSpanId = transaction.contexts?.trace?.span_id;
        const traceId = transaction.contexts?.trace?.trace_id;

        assertSentryTransaction(transaction, {
          transaction: 'test-span',
          transaction_info: { source: 'custom' },
          release: '1.0.0',
          environment: 'production',
          sdk: { name: EXPECTED_SDK_NAME, version: SDK_VERSION },
          contexts: {
            trace: {
              span_id: expect.stringMatching(/^[\da-f]{16}$/),
              trace_id: expect.stringMatching(/^[\da-f]{32}$/),
              op: 'test',
              origin: 'manual',
              status: 'ok',
              data: {
                [SENTRY_OP]: 'test',
                [SENTRY_ORIGIN]: 'manual',
                [SENTRY_SEGMENT_NAME_SOURCE]: 'custom',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              },
            },
          },
        });

        expect(transaction.spans).toEqual([
          {
            description: 'test-child-span',
            op: 'test-child',
            origin: 'manual',
            data: { [SENTRY_OP]: 'test-child', [SENTRY_ORIGIN]: 'manual' },
            parent_span_id: rootSpanId,
            trace_id: traceId,
            span_id: expect.stringMatching(/^[\da-f]{16}$/),
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            status: 'ok',
          },
          {
            description: 'test-inactive-span',
            origin: 'manual',
            data: { [SENTRY_ORIGIN]: 'manual' },
            parent_span_id: rootSpanId,
            trace_id: traceId,
            span_id: expect.stringMatching(/^[\da-f]{16}$/),
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            status: 'ok',
            links: [
              {
                attributes: { [SENTRY_LINK_TYPE]: 'some_relation' },
                sampled: true,
                span_id: rootSpanId,
                trace_id: traceId,
              },
            ],
          },
          {
            description: 'test-manual-span',
            origin: 'manual',
            data: { [SENTRY_ORIGIN]: 'manual' },
            parent_span_id: rootSpanId,
            trace_id: traceId,
            span_id: expect.stringMatching(/^[\da-f]{16}$/),
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            status: 'ok',
          },
        ]);
      },
    })
    .start()
    .completed();
});
