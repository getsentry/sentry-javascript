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

// Marks a callback we've already wrapped. A user can reuse one config object across multiple
// `consumer.run(config)` calls (e.g. a second consumer); without this guard the second `start` would
// wrap the wrapper and emit duplicate spans per message.
const consumerCallbackWrapped: unique symbol = Symbol('kafkajs-consumer-callback-wrapped');

type MaybeWrapped = { [consumerCallbackWrapped]?: true };

/** Whether `fn` is a callback this module already wrapped, so callers skip re-wrapping it. */
export function isWrappedConsumerCallback(fn: unknown): boolean {
  return typeof fn === 'function' && (fn as MaybeWrapped)[consumerCallbackWrapped] === true;
}

/** Wraps `eachMessage` so each processed message becomes a consumer span parented to the message's producer. */
export function wrapEachMessage(original: EachMessageHandler): EachMessageHandler {
  const wrapped: EachMessageHandler & MaybeWrapped = function eachMessage(this: unknown, payload) {
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
  wrapped[consumerCallbackWrapped] = true;
  return wrapped;
}

/** Wraps `eachBatch` so the batch pull becomes a fresh-root receiving span with a process span per message. */
export function wrapEachBatch(original: EachBatchHandler): EachBatchHandler {
  const wrapped: EachBatchHandler & MaybeWrapped = function eachBatch(this: unknown, payload) {
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
  wrapped[consumerCallbackWrapped] = true;
  return wrapped;
}
