/*
 * Span-creating wrappers for the kafkajs consumer callbacks, ported from the vendored OTel
 * instrumentation's `_getConsumerEachMessagePatch`/`_getConsumerEachBatchPatch`. The `run` channel's
 * `start` subscriber swaps the user's `eachMessage`/`eachBatch` for these before the original runs.
 */

import { MESSAGING_BATCH_MESSAGE_COUNT } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { continueTrace, startNewTrace, withActiveSpan } from '@sentry/core';
import {
  ATTR_MESSAGING_DESTINATION_PARTITION_ID,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
} from './semconv';
import { endSpansOnPromise, getHeaderAsString, getLinksFromHeaders, startConsumerSpan } from './spans';
import type { EachBatchHandler, EachMessageHandler, KafkaMessage } from './types';

/** Wraps `eachMessage` so each processed message becomes a consumer span parented to the message's producer. */
export function wrapEachMessage(original: EachMessageHandler): EachMessageHandler {
  return function eachMessage(this: unknown, payload) {
    const sentryTrace = getHeaderAsString(payload.message.headers, 'sentry-trace');
    const baggage = getHeaderAsString(payload.message.headers, 'baggage');

    // Continue the producer's trace so the consumer span is parented to the message's producer.
    return continueTrace({ sentryTrace, baggage }, () => {
      const span = startConsumerSpan({
        topic: payload.topic,
        message: payload.message,
        operationType: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
        attributes: {
          [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.partition),
        },
      });

      const promise = withActiveSpan(span, () => original.call(this, payload));
      return endSpansOnPromise([span], promise);
    });
  };
}

/** Wraps `eachBatch` so the batch pull becomes a fresh-root receiving span with a process span per message. */
export function wrapEachBatch(original: EachBatchHandler): EachBatchHandler {
  return function eachBatch(this: unknown, payload) {
    // A batch pull aggregates messages from many producers, so the receiving span is a fresh root
    // trace and each processed message links back to its own producer span. Mirrors the OTel messaging
    // semantic conventions for a topic with multiple consumers.
    const receivingSpan = startNewTrace(() =>
      startConsumerSpan({
        topic: payload.batch.topic,
        message: undefined,
        operationType: MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
        attributes: {
          [MESSAGING_BATCH_MESSAGE_COUNT]: payload.batch.messages.length,
          [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.batch.partition),
        },
      }),
    );

    return withActiveSpan(receivingSpan, () => {
      const spans: Span[] = [receivingSpan];
      payload.batch.messages.forEach((message: KafkaMessage) => {
        spans.push(
          startConsumerSpan({
            topic: payload.batch.topic,
            message,
            operationType: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
            links: getLinksFromHeaders(message.headers),
            attributes: {
              [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.batch.partition),
            },
          }),
        );
      });
      const promise = original.call(this, payload);
      return endSpansOnPromise(spans, promise);
    });
  };
}
