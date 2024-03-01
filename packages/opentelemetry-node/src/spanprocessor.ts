import type { Context } from '@opentelemetry/api';
import { SpanKind, context, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import type { Span as OtelSpan, SpanProcessor as OtelSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SentrySpan } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  Transaction,
  addEventProcessor,
  addTracingExtensions,
  getClient,
  getCurrentHub,
} from '@sentry/core';
import type { DynamicSamplingContext, TraceparentData, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY, SENTRY_TRACE_PARENT_CONTEXT_KEY } from './constants';
import { DEBUG_BUILD } from './debug-build';
import { maybeCaptureExceptionForTimedEvent } from './utils/captureExceptionForTimedEvent';
import { isSentryRequestSpan } from './utils/isSentryRequest';
import { mapOtelStatus } from './utils/mapOtelStatus';
import { parseOtelSpanDescription } from './utils/parseOtelSpanDescription';
import { clearSpan, getSentrySpan, setSentrySpan } from './utils/spanMap';

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor implements OtelSpanProcessor {
  public constructor() {
    addTracingExtensions();

    addEventProcessor(event => {
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
    const sentryParentSpan = otelParentSpanId && getSentrySpan(otelParentSpanId);

    if (sentryParentSpan) {
      // eslint-disable-next-line deprecation/deprecation
      const sentryChildSpan = sentryParentSpan.startChild({
        name: otelSpan.name,
        startTimestamp: convertOtelTimeToSeconds(otelSpan.startTime),
        spanId: otelSpanId,
      }) as SentrySpan;

      setSentrySpan(otelSpanId, sentryChildSpan);
    } else {
      const traceCtx = getTraceData(otelSpan, parentContext);
      // eslint-disable-next-line deprecation/deprecation
      const transaction = getCurrentHub().startTransaction({
        name: otelSpan.name,
        ...traceCtx,
        attributes: otelSpan.attributes,
        startTimestamp: convertOtelTimeToSeconds(otelSpan.startTime),
        spanId: otelSpanId,
      });

      setSentrySpan(otelSpanId, transaction as unknown as SentrySpan);
    }
  }

  /**
   * @inheritDoc
   */
  public onEnd(otelSpan: OtelSpan): void {
    const otelSpanId = otelSpan.spanContext().spanId;
    const sentrySpan = getSentrySpan(otelSpanId);

    if (!sentrySpan) {
      DEBUG_BUILD && logger.error(`SentrySpanProcessor could not find span with OTEL-spanId ${otelSpanId} to finish.`);
      clearSpan(otelSpanId);
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

    const client = getClient();

    const mutableOptions = { drop: false };
    client && client.emit('otelSpanEnd', otelSpan, mutableOptions);

    if (mutableOptions.drop) {
      clearSpan(otelSpanId);
      return;
    }

    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHub();
    otelSpan.events.forEach(event => {
      maybeCaptureExceptionForTimedEvent(hub, event, otelSpan);
    });

    if (sentrySpan instanceof Transaction) {
      updateTransactionWithOtelData(sentrySpan, otelSpan);
      sentrySpan.setHub(hub);
    } else {
      updateSpanWithOtelData(sentrySpan, otelSpan);
    }

    // Ensure we do not capture any OTEL spans for finishing (and sending) this
    context.with(suppressTracing(context.active()), () => {
      sentrySpan.end(convertOtelTimeToSeconds(otelSpan.endTime));
    });

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
    const client = getClient();
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
    },
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
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

  const { op, description, data } = parseOtelSpanDescription(otelSpan);

  sentrySpan.setStatus(mapOtelStatus(otelSpan));

  const allData = {
    ...attributes,
    ...data,
    'otel.kind': SpanKind[kind],
  };
  sentrySpan.setAttributes(allData);

  sentrySpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, op);
  sentrySpan.updateName(description);
}

function updateTransactionWithOtelData(transaction: Transaction, otelSpan: OtelSpan): void {
  const { op, description, source, data } = parseOtelSpanDescription(otelSpan);

  // eslint-disable-next-line deprecation/deprecation
  transaction.setContext('otel', {
    attributes: otelSpan.attributes,
    resource: otelSpan.resource.attributes,
  });

  const allData = data || {};
  transaction.setAttributes(allData);

  transaction.setStatus(mapOtelStatus(otelSpan));

  transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, op);
  transaction.updateName(description);
  transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
}

function convertOtelTimeToSeconds([seconds, nano]: [number, number]): number {
  return seconds + nano / 1_000_000_000;
}
