import type { Context } from '@opentelemetry/api';
import { SpanKind, trace } from '@opentelemetry/api';
import type { Span as OtelSpan, SpanProcessor as OtelSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { addGlobalEventProcessor, addTracingExtensions, getCurrentHub, Transaction } from '@sentry/core';
import type { DynamicSamplingContext, Span as SentrySpan, TraceparentData, TransactionContext } from '@sentry/types';
import { isString, logger } from '@sentry/utils';

import { SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY, SENTRY_TRACE_PARENT_CONTEXT_KEY } from './constants';
import { isSentryRequestSpan } from './utils/isSentryRequest';
import { mapOtelStatus } from './utils/mapOtelStatus';
import { parseSpanDescription } from './utils/parseOtelSpanDescription';
import { clearOtelSpanData, getOtelSpanData } from './utils/spanData';

export const SENTRY_SPAN_PROCESSOR_MAP: Map<SentrySpan['spanId'], SentrySpan> = new Map<
  SentrySpan['spanId'],
  SentrySpan
>();

// make sure to remove references in maps, to ensure this can be GCed
function clearSpan(otelSpanId: string): void {
  clearOtelSpanData(otelSpanId);
  SENTRY_SPAN_PROCESSOR_MAP.delete(otelSpanId);
}

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor implements OtelSpanProcessor {
  public constructor() {
    addTracingExtensions();

    addGlobalEventProcessor(event => {
      const otelSpan = trace && trace.getActiveSpan && (trace.getActiveSpan() as OtelSpan | undefined);
      if (!otelSpan) {
        return event;
      }

      const otelSpanContext = otelSpan.spanContext();

      // If event has already set `trace` context, use that one.
      event.contexts = {
        trace: {
          trace_id: otelSpanContext.traceId,
          span_id: otelSpanContext.spanId,
          parent_span_id: otelSpan.parentSpanId,
        },
        ...event.contexts,
      };

      return event;
    });
  }

  /**
   * @inheritDoc
   */
  public onStart(otelSpan: OtelSpan, parentContext: Context): void {
    const otelSpanId = otelSpan.spanContext().spanId;
    const otelParentSpanId = otelSpan.parentSpanId;

    // Otel supports having multiple non-nested spans at the same time
    // so we cannot use hub.getSpan(), as we cannot rely on this being on the current span
    const sentryParentSpan = otelParentSpanId && SENTRY_SPAN_PROCESSOR_MAP.get(otelParentSpanId);

    if (sentryParentSpan) {
      const sentryChildSpan = sentryParentSpan.startChild({
        description: otelSpan.name,
        instrumenter: 'otel',
        startTimestamp: convertOtelTimeToSeconds(otelSpan.startTime),
        spanId: otelSpanId,
      });

      SENTRY_SPAN_PROCESSOR_MAP.set(otelSpanId, sentryChildSpan);
    } else {
      const traceCtx = getTraceData(otelSpan, parentContext);
      const transaction = getCurrentHub().startTransaction({
        name: otelSpan.name,
        ...traceCtx,
        instrumenter: 'otel',
        startTimestamp: convertOtelTimeToSeconds(otelSpan.startTime),
        spanId: otelSpanId,
      });

      SENTRY_SPAN_PROCESSOR_MAP.set(otelSpanId, transaction);
    }
  }

  /**
   * @inheritDoc
   */
  public onEnd(otelSpan: OtelSpan): void {
    const otelSpanId = otelSpan.spanContext().spanId;
    const sentrySpan = SENTRY_SPAN_PROCESSOR_MAP.get(otelSpanId);

    if (!sentrySpan) {
      __DEBUG_BUILD__ &&
        logger.error(`SentrySpanProcessor could not find span with OTEL-spanId ${otelSpanId} to finish.`);
      return;
    }

    // Auto-instrumentation often captures outgoing HTTP requests
    // This means that Sentry HTTP requests created by this integration can, in turn, be captured by OTEL auto instrumentation,
    // leading to an infinite loop.
    // In this case, we do not want to finish the span, in order to avoid sending it to Sentry
    if (isSentryRequestSpan(otelSpan)) {
      clearSpan(otelSpanId);
      return;
    }

    const client = getCurrentHub().getClient();

    const mutableOptions = { drop: false };
    client && client.emit && client?.emit('otelSpanEnd', otelSpan, mutableOptions);

    if (mutableOptions.drop) {
      clearSpan(otelSpanId);
      return;
    }

    otelSpan.events.forEach(event => {
      if (event.name !== 'exception') {
        return;
      }

      const attributes = event.attributes;
      if (!attributes) {
        return;
      }

      const message = attributes[SemanticAttributes.EXCEPTION_MESSAGE];
      const syntheticError = new Error(message as string | undefined);

      const stack = attributes[SemanticAttributes.EXCEPTION_STACKTRACE];
      if (isString(stack)) {
        syntheticError.stack = stack;
      }

      const type = attributes[SemanticAttributes.EXCEPTION_TYPE];
      if (isString(type)) {
        syntheticError.name = type;
      }

      getCurrentHub().captureException(syntheticError, {
        captureContext: {
          contexts: {
            otel: {
              attributes: otelSpan.attributes,
              resource: otelSpan.resource.attributes,
            },
            trace: {
              trace_id: otelSpan.spanContext().traceId,
              span_id: otelSpan.spanContext().spanId,
              parent_span_id: otelSpan.parentSpanId,
            },
          },
        },
      });
    });

    if (sentrySpan instanceof Transaction) {
      updateTransactionWithOtelData(sentrySpan, otelSpan);
      sentrySpan.setHub(getCurrentHub());
    } else {
      updateSpanWithOtelData(sentrySpan, otelSpan);
    }

    sentrySpan.finish(convertOtelTimeToSeconds(otelSpan.endTime));

    clearSpan(otelSpanId);
  }

  /**
   * @inheritDoc
   */
  public shutdown(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * @inheritDoc
   */
  public async forceFlush(): Promise<void> {
    const client = getCurrentHub().getClient();
    if (client) {
      return client.flush().then();
    }
    return Promise.resolve();
  }
}

function getTraceData(otelSpan: OtelSpan, parentContext: Context): Partial<TransactionContext> {
  const spanContext = otelSpan.spanContext();
  const traceId = spanContext.traceId;
  const spanId = spanContext.spanId;

  const parentSpanId = otelSpan.parentSpanId;
  const traceparentData = parentContext.getValue(SENTRY_TRACE_PARENT_CONTEXT_KEY) as TraceparentData | undefined;
  const dynamicSamplingContext = parentContext.getValue(SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY) as
    | Partial<DynamicSamplingContext>
    | undefined;

  const context: Partial<TransactionContext> = {
    spanId,
    traceId,
    parentSpanId,
    metadata: {
      // only set dynamic sampling context if sentry-trace header was set
      dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
      source: 'custom',
    },
  };

  // Only inherit sample rate if `traceId` is the same
  if (traceparentData && traceId === traceparentData.traceId) {
    context.parentSampled = traceparentData.parentSampled;
  }

  return context;
}

function updateSpanWithOtelData(sentrySpan: SentrySpan, otelSpan: OtelSpan): void {
  const { attributes, kind } = otelSpan;

  const { op, description, data } = parseSpanDescription(otelSpan);

  const { data: additionalData, tags, origin } = getOtelSpanData(otelSpan.spanContext().spanId);

  sentrySpan.setStatus(mapOtelStatus(otelSpan));
  sentrySpan.setData('otel.kind', SpanKind[kind]);

  if (tags) {
    Object.keys(tags).forEach(prop => {
      sentrySpan.setTag(prop, tags[prop]);
    });
  }

  const allData = { ...attributes, ...data, ...additionalData };

  Object.keys(allData).forEach(prop => {
    const value = allData[prop];
    sentrySpan.setData(prop, value);
  });

  sentrySpan.op = op;
  sentrySpan.description = description;

  if (origin) {
    sentrySpan.origin = origin;
  }
}

function updateTransactionWithOtelData(transaction: Transaction, otelSpan: OtelSpan): void {
  const { op, description, source, data } = parseSpanDescription(otelSpan);
  const { data: additionalData, tags, contexts, metadata, origin } = getOtelSpanData(otelSpan.spanContext().spanId);

  transaction.setContext('otel', {
    attributes: otelSpan.attributes,
    resource: otelSpan.resource.attributes,
  });

  if (tags) {
    Object.keys(tags).forEach(prop => {
      transaction.setTag(prop, tags[prop]);
    });
  }

  if (metadata) {
    transaction.setMetadata(metadata);
  }

  const allData = { ...data, ...additionalData };

  Object.keys(allData).forEach(prop => {
    const value = allData[prop];
    transaction.setData(prop, value);
  });

  if (contexts) {
    Object.keys(contexts).forEach(prop => {
      transaction.setContext(prop, contexts[prop]);
    });
  }

  transaction.setStatus(mapOtelStatus(otelSpan));

  transaction.op = op;
  transaction.setName(description, source);

  if (origin) {
    transaction.origin = origin;
  }
}

function convertOtelTimeToSeconds([seconds, nano]: [number, number]): number {
  return seconds + nano / 1_000_000_000;
}
