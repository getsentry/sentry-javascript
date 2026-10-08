import { QUEUE, QUEUE_PROCESS, QUEUE_PUBLISH } from '@sentry/conventions/op';
import type { SpanAttributes } from '@sentry/core';
import {
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE,
  startInactiveSpan,
  startNewTrace,
} from '@sentry/core';
import { SentryBullMQSpan } from './span';
import type { AttributeValue, SpanOptions, TelemetrySpan, Tracer, SentryContext } from './types';

const MESSAGING_SYSTEM = 'bullmq';

// BullMQ span names follow OTel messaging semconv: "{operation} {destination}"
// e.g. "add myQueue", "addBulk myQueue", "process myQueue", "addFlow myQueue"
const PRODUCER_OPERATIONS = new Set(['add', 'addbulk', 'addflow', 'addbulkflows']);
const CONSUMER_OPERATIONS = new Set(['process']);

function getOperation(name: string): string {
  return name.split(' ')[0]!.toLowerCase();
}

function getOpFromSpanName(name: string): string {
  const operation = getOperation(name);

  if (CONSUMER_OPERATIONS.has(operation)) {
    return QUEUE_PROCESS;
  }

  if (PRODUCER_OPERATIONS.has(operation)) {
    return QUEUE_PUBLISH;
  }

  return QUEUE;
}

function getOriginFromSpanName(name: string): string {
  const operation = getOperation(name);

  if (CONSUMER_OPERATIONS.has(operation)) {
    return 'auto.queue.bullmq.consumer';
  }

  if (PRODUCER_OPERATIONS.has(operation)) {
    return 'auto.queue.bullmq.producer';
  }

  return 'auto.queue.bullmq';
}

function toSentryAttributes(attributes: Record<string, AttributeValue>): SpanAttributes {
  return attributes as SpanAttributes;
}

export class SentryBullMQTracer implements Tracer<SentryContext> {
  public startSpan(name: string, options?: SpanOptions, context?: SentryContext): TelemetrySpan {
    const op = getOpFromSpanName(name);
    const origin = getOriginFromSpanName(name);

    const attributes: SpanAttributes = {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
      'messaging.system': MESSAGING_SYSTEM,
    };

    if (options?.attributes) {
      Object.assign(attributes, toSentryAttributes(options.attributes));
    }

    const span =
      op === QUEUE_PROCESS
        ? startNewTrace(() => startInactiveSpan({ name, attributes }))
        : startInactiveSpan({ name, attributes });

    if (context?.producerSpanContext) {
      const producerSpanCtx = {
        traceId: context.producerSpanContext.traceId,
        spanId: context.producerSpanContext.spanId,
        traceFlags: context.producerSpanContext.sampled ? 1 : 0,
      };

      span.addLink({
        context: producerSpanCtx,
        attributes: {
          [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
        },
      });
    }

    return new SentryBullMQSpan(span, getCurrentScope());
  }
}
