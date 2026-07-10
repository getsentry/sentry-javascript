/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-kafkajs
 * - Upstream version: @opentelemetry/instrumentation-kafkajs@0.27.0
 * - Span builders migrated to the `@sentry/core` span API. Kept byte-identical in span name/attributes
 *   for parity with the OTel integration this replaces; only the origin changes to
 *   `auto.kafkajs.orchestrion.*` to mark the injection path.
 */

import {
  ERROR_TYPE,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_OPERATION_NAME,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_SYSTEM,
} from '@sentry/conventions/attributes';
import type { Span, SpanAttributes, SpanLink } from '@sentry/core';
import {
  getTraceData,
  propagationContextFromHeaders,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
} from '@sentry/core';
import type { KafkaMessage, Message } from './types';
import {
  ATTR_MESSAGING_DESTINATION_PARTITION_ID,
  ATTR_MESSAGING_KAFKA_MESSAGE_KEY,
  ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE,
  ATTR_MESSAGING_KAFKA_OFFSET,
  ERROR_TYPE_VALUE_OTHER,
  MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
  MESSAGING_OPERATION_TYPE_VALUE_SEND,
  MESSAGING_SYSTEM_VALUE_KAFKA,
} from './semconv';

const PRODUCER_ORIGIN = 'auto.kafkajs.orchestrion.producer';
const CONSUMER_ORIGIN = 'auto.kafkajs.orchestrion.consumer';

// `@opentelemetry/api` `TraceFlags`, inlined to avoid an OTel dep: SAMPLED = 0x1, NONE = 0x0.
const TRACE_FLAG_SAMPLED = 1;
const TRACE_FLAG_NONE = 0;

interface ConsumerSpanOptions {
  topic: string;
  message: KafkaMessage | undefined;
  operationType: string;
  attributes: SpanAttributes;
  links?: SpanLink[];
}

/**
 * Reads a header value off a kafkajs message as a string. kafkajs delivers headers as `Buffer`s (or
 * arrays of them), so we normalize to a string before handing them to Sentry's trace helpers.
 */
export function getHeaderAsString(headers: KafkaMessage['headers'], key: string): string | undefined {
  const value = headers?.[key];
  if (value == null) {
    return undefined;
  }
  return Array.isArray(value) ? value[0]?.toString() : value.toString();
}

/**
 * Builds a span link to the producer span carried in the message headers, mirroring the upstream
 * behavior of linking each batch-processed message to its originating producer span.
 */
export function getLinksFromHeaders(headers: KafkaMessage['headers']): SpanLink[] | undefined {
  const sentryTrace = getHeaderAsString(headers, 'sentry-trace');
  if (!sentryTrace) {
    return undefined;
  }

  const { traceId, parentSpanId, sampled } = propagationContextFromHeaders(
    sentryTrace,
    getHeaderAsString(headers, 'baggage'),
  );
  if (!parentSpanId) {
    return undefined;
  }

  return [
    {
      context: {
        traceId,
        spanId: parentSpanId,
        isRemote: true,
        traceFlags: sampled ? TRACE_FLAG_SAMPLED : TRACE_FLAG_NONE,
      },
    },
  ];
}

/** Starts an inactive consumer (process/receive) span carrying the kafkajs messaging attributes. */
export function startConsumerSpan({ topic, message, operationType, links, attributes }: ConsumerSpanOptions): Span {
  // The batch "receive" span is named `poll`; per-message spans use the operation type verbatim.
  const operationName = operationType === MESSAGING_OPERATION_TYPE_VALUE_RECEIVE ? 'poll' : operationType;

  return startInactiveSpan({
    name: `${operationName} ${topic}`,
    // todo(v11): Use https://getsentry.github.io/sentry-conventions/ops/#messaging
    op: 'message',
    kind: operationType === MESSAGING_OPERATION_TYPE_VALUE_RECEIVE ? SPAN_KIND.CLIENT : SPAN_KIND.CONSUMER,
    links,
    attributes: {
      ...attributes,
      [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
      [MESSAGING_DESTINATION_NAME]: topic,
      [MESSAGING_OPERATION_TYPE]: operationType,
      [MESSAGING_OPERATION_NAME]: operationName,
      [ATTR_MESSAGING_KAFKA_MESSAGE_KEY]: message?.key ? String(message.key) : undefined,
      [ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE]: message?.key && message.value === null ? true : undefined,
      [ATTR_MESSAGING_KAFKA_OFFSET]: message?.offset as string | undefined,
      // Mirror the upstream behavior of only tagging per-message processing spans (not the batch
      // receiving span, which carries no message) with the auto origin.
      ...(message ? { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: CONSUMER_ORIGIN } : {}),
    },
  });
}

/** Starts an inactive producer span and propagates its trace into the message headers. */
export function startProducerSpan(topic: string, message: Message): Span {
  const span = startInactiveSpan({
    name: `send ${topic}`,
    op: 'message',
    kind: SPAN_KIND.PRODUCER,
    attributes: {
      [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
      [MESSAGING_DESTINATION_NAME]: topic,
      [ATTR_MESSAGING_KAFKA_MESSAGE_KEY]: message.key ? String(message.key) : undefined,
      [ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE]: message.key && message.value === null ? true : undefined,
      [ATTR_MESSAGING_DESTINATION_PARTITION_ID]:
        message.partition !== undefined ? String(message.partition) : undefined,
      [MESSAGING_OPERATION_NAME]: 'send',
      [MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_SEND,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: PRODUCER_ORIGIN,
    },
  });

  // Propagate the producer span's trace to consumers via the message headers.
  message.headers = message.headers ?? {};
  const traceData = getTraceData({ span });
  if (traceData['sentry-trace']) {
    message.headers['sentry-trace'] = traceData['sentry-trace'];
  }
  if (traceData.baggage) {
    message.headers['baggage'] = traceData.baggage;
  }

  return span;
}

/**
 * Marks all `spans` with the error status and `error.type` derived from a settle-time `reason`,
 * WITHOUT ending them. Mirrors the vendored `endSpansOnPromise` catch block. The producer path (which
 * receives discrete `error`/`asyncEnd` channel events) applies the error on `error` and ends on
 * `asyncEnd`; the consumer path folds this into `endSpansOnPromise`.
 */
export function applyErrorToSpans(spans: Span[], reason: unknown): void {
  let errorMessage: string | undefined;
  let errorType: string = ERROR_TYPE_VALUE_OTHER;
  if (typeof reason === 'string' || reason === undefined) {
    errorMessage = reason;
  } else if (typeof reason === 'object' && reason !== null && Object.prototype.hasOwnProperty.call(reason, 'message')) {
    errorMessage = (reason as { message?: string }).message;
    errorType = (reason as { constructor: { name: string } }).constructor.name;
  }

  spans.forEach(span => {
    span.setAttribute(ERROR_TYPE, errorType);
    span.setStatus({ code: SPAN_STATUS_ERROR, message: errorMessage });
  });
}

/**
 * Resolves once `promise` settles, applying the error status to all `spans` on failure and ending
 * them regardless. Used by the consumer path, which invokes the user callback directly (and so holds a
 * real promise). Verbatim from the vendored `endSpansOnPromise`.
 */
export function endSpansOnPromise<T>(spans: Span[], promise: Promise<T>): Promise<T> {
  return Promise.resolve(promise)
    .catch(reason => {
      applyErrorToSpans(spans, reason);
      throw reason;
    })
    .finally(() => {
      spans.forEach(span => span.end());
    });
}
