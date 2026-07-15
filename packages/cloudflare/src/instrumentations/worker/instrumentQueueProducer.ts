import type { MessageSendRequest, Queue, QueueSendBatchOptions, QueueSendOptions } from '@cloudflare/workers-types';
import { getTraceData, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import { addQueueTraceContext } from '../../utils/queueTraceMeta';

const ORIGIN = 'auto.faas.cloudflare.queue';

function startPublishSpan<T>(
  options: {
    bindingName: string;
    bodySize: number | undefined;
    messageCount?: number;
  },
  callback: () => T,
): T {
  const { bindingName, bodySize, messageCount } = options;

  return startSpan(
    {
      op: 'queue.publish',
      name: `send ${bindingName}`,
      attributes: {
        'messaging.system': 'cloudflare',
        'messaging.destination.name': bindingName,
        'messaging.operation.type': 'send',
        'messaging.operation.name': 'send',
        ...(messageCount !== undefined && { 'messaging.batch.message_count': messageCount }),
        'messaging.message.body.size': bodySize,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.publish',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
      },
    },
    callback,
  );
}

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

/**
 * Wraps a Queue producer binding to create `queue.publish` spans on
 * `send` and `sendBatch` calls.
 *
 * The queue's own name is not available on the binding object, so we use
 * the env binding key (e.g. `MY_QUEUE`) as `messaging.destination.name`.
 */
export function instrumentQueueProducer<T extends Queue>(
  queue: T,
  bindingName: string,
  enableTracePropagation = false,
): T {
  return new Proxy(queue, {
    get(target, prop, receiver) {
      if (prop === 'send') {
        const original = Reflect.get(target, prop, receiver) as Queue['send'];

        return function (this: unknown, message: unknown, options?: QueueSendOptions): ReturnType<Queue['send']> {
          return startPublishSpan({ bindingName, bodySize: getBodySize(message) }, () =>
            Reflect.apply(original, target, [
              // Read trace data here so the carrier points to queue.publish, not its parent span.
              enableTracePropagation ? addQueueTraceContext(message, getTraceData()) : message,
              options,
            ]),
          );
        };
      }

      if (prop === 'sendBatch') {
        const original = Reflect.get(target, prop, receiver) as Queue['sendBatch'];
        return function (
          this: unknown,
          messages: Iterable<MessageSendRequest>,
          options?: QueueSendBatchOptions,
        ): ReturnType<Queue['sendBatch']> {
          const messageArray = Array.from(messages);
          const totalBodySize = messageArray.reduce<number | undefined>((acc, m) => {
            const size = getBodySize(m.body);
            if (size === undefined) {
              return acc;
            }
            return (acc ?? 0) + size;
          }, undefined);

          return startPublishSpan({ bindingName, bodySize: totalBodySize, messageCount: messageArray.length }, () => {
            if (!enableTracePropagation) {
              return Reflect.apply(original, target, [messageArray, options]);
            }

            // Every entry was published by this batch span, so they intentionally share one producer context.
            const traceData = getTraceData();
            const tracedMessages = messageArray.map(message => ({
              ...message,
              body: addQueueTraceContext(message.body, traceData),
            }));
            return Reflect.apply(original, target, [tracedMessages, options]);
          });
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
