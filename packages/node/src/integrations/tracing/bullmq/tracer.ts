import type { SpanAttributes } from '@sentry/core';
import {
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE,
  startInactiveSpan,
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
    return 'queue.task';
  }

  if (PRODUCER_OPERATIONS.has(operation)) {
    return 'queue.submit';
  }

  return 'queue';
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

    const span = startInactiveSpan({
      name,
      attributes,
      forceTransaction: op === 'queue.task',
    });

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

      // TODO(v11): Remove this once EAP can store span links. We currently only set this attribute so that we
      // can obtain the previous trace information from the EAP store. Long-term, EAP will handle
      // span links and then we should remove this again.
      span.setAttribute(
        'sentry.previous_trace',
        `${producerSpanCtx.traceId}-${producerSpanCtx.spanId}-${producerSpanCtx.traceFlags}`,
      );
    }

    return new SentryBullMQSpan(span, getCurrentScope());
  }
}
