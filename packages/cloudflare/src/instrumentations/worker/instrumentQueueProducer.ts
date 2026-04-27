import type { MessageSendRequest, Queue, QueueSendBatchOptions, QueueSendOptions } from '@cloudflare/workers-types';
import {
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanIsSampled,
  startSpan,
} from '@sentry/core';
import { isWrappableBody, wrapBodyWithTraceContext } from '../../utils/queueEnvelope';

const ORIGIN = 'auto.faas.cloudflare.queue';

function getBodySize(body: unknown): number | undefined {
  if (body == null) {
    return undefined;
  }
  if (typeof body === 'string') {
    return new TextEncoder().encode(body).byteLength;
  }
  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }
  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }
  try {
    return new TextEncoder().encode(JSON.stringify(body)).byteLength;
  } catch {
    return undefined;
  }
}

function maybeWrapBody(body: unknown, propagateTraces: boolean): unknown {
  if (!propagateTraces || !isWrappableBody(body)) {
    return body;
  }
  const span = getActiveSpan();
  if (!span) {
    return body;
  }
  const ctx = span.spanContext();
  return wrapBodyWithTraceContext(body, {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    sampled: spanIsSampled(span),
  });
}

/**
 * Wraps a Queue producer binding to create `queue.publish` spans on
 * `send` and `sendBatch` calls.
 *
 * When `propagateTraces` is true, message bodies that are plain objects are
 * wrapped with a trace-context envelope so the consumer can attach a span
 * Link from its `process` span to this producer's `send` span. Non-object
 * bodies are sent unchanged.
 *
 * The queue's own name is not available on the binding object, so we use
 * the env binding key (e.g. `MY_QUEUE`) as `messaging.destination.name`.
 */
export function instrumentQueueProducer<T extends Queue>(queue: T, bindingName: string, propagateTraces = false): T {
  return new Proxy(queue, {
    get(target, prop, receiver) {
      if (prop === 'send') {
        const original = Reflect.get(target, prop, receiver) as Queue['send'];
        return function (this: unknown, message: unknown, options?: QueueSendOptions): Promise<void> {
          return startSpan(
            {
              op: 'queue.publish',
              name: `send ${bindingName}`,
              attributes: {
                'messaging.system': 'cloudflare',
                'messaging.destination.name': bindingName,
                'messaging.operation.type': 'send',
                'messaging.operation.name': 'send',
                'messaging.message.body.size': getBodySize(message),
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.publish',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
              },
            },
            () => original.call(target, maybeWrapBody(message, propagateTraces) as never, options),
          );
        };
      }

      if (prop === 'sendBatch') {
        const original = Reflect.get(target, prop, receiver) as Queue['sendBatch'];
        return function (
          this: unknown,
          messages: Iterable<MessageSendRequest>,
          options?: QueueSendBatchOptions,
        ): Promise<void> {
          const messageArray = Array.from(messages);
          const totalBodySize = messageArray.reduce<number>((acc, m) => {
            const size = getBodySize(m.body);
            return size === undefined ? acc : acc + size;
          }, 0);

          return startSpan(
            {
              op: 'queue.publish',
              name: `send ${bindingName}`,
              attributes: {
                'messaging.system': 'cloudflare',
                'messaging.destination.name': bindingName,
                'messaging.operation.type': 'send',
                'messaging.operation.name': 'send',
                'messaging.batch.message_count': messageArray.length,
                'messaging.message.body.size': totalBodySize,
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.publish',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
              },
            },
            () => {
              const wrapped = propagateTraces
                ? messageArray.map(m => ({ ...m, body: maybeWrapBody(m.body, propagateTraces) }))
                : messageArray;
              return original.call(target, wrapped as never, options);
            },
          );
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
