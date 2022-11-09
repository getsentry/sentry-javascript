import { Context } from '@opentelemetry/api';
import { Span as OtelSpan, SpanProcessor as OtelSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getCurrentHub } from '@sentry/core';
import { Transaction } from '@sentry/tracing';
import { DynamicSamplingContext, Span as SentrySpan, TraceparentData, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY, SENTRY_TRACE_PARENT_CONTEXT_KEY } from './constants';
import { isSentryRequestSpan } from './utils/is-sentry-request';
import { mapOtelStatus } from './utils/map-otel-status';
import { parseSpanDescription } from './utils/parse-otel-span-description';

export const SENTRY_SPAN_PROCESSOR_MAP: Map<SentrySpan['spanId'], SentrySpan> = new Map<
  SentrySpan['spanId'],
  SentrySpan
>();

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor implements OtelSpanProcessor {
  /**
   * @inheritDoc
   */
  public onStart(otelSpan: OtelSpan, parentContext: Context): void {
    const hub = getCurrentHub();
    if (!hub) {
      __DEBUG_BUILD__ && logger.error('SentrySpanProcessor has triggered onStart before a hub has been setup.');
      return;
    }
    const scope = hub.getScope();
    if (!scope) {
      __DEBUG_BUILD__ && logger.error('SentrySpanProcessor has triggered onStart before a scope has been setup.');
      return;
    }

    const otelSpanId = otelSpan.spanContext().spanId;
    const otelParentSpanId = otelSpan.parentSpanId;

    // Otel supports having multiple non-nested spans at the same time
    // so we cannot use hub.getSpan(), as we cannot rely on this being on the current span
    const sentryParentSpan = otelParentSpanId && SENTRY_SPAN_PROCESSOR_MAP.get(otelParentSpanId);

    if (sentryParentSpan) {
      const sentryChildSpan = sentryParentSpan.startChild({
        description: otelSpan.name,
        // instrumentor: 'otel',
        startTimestamp: convertOtelTimeToSeconds(otelSpan.startTime),
        spanId: otelSpanId,
      });

      SENTRY_SPAN_PROCESSOR_MAP.set(otelSpanId, sentryChildSpan);
    } else {
      const traceCtx = getTraceData(otelSpan, parentContext);
      const transaction = hub.startTransaction({
        name: otelSpan.name,
        ...traceCtx,
        // instrumentor: 'otel',
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
      // Make sure to remove any references, so this can be GCed
      SENTRY_SPAN_PROCESSOR_MAP.delete(otelSpanId);
      return;
    }

    if (sentrySpan instanceof Transaction) {
      updateTransactionWithOtelData(sentrySpan, otelSpan);
    } else {
      updateSpanWithOtelData(sentrySpan, otelSpan);
    }

    sentrySpan.finish(convertOtelTimeToSeconds(otelSpan.endTime));

    SENTRY_SPAN_PROCESSOR_MAP.delete(otelSpanId);
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

  sentrySpan.setStatus(mapOtelStatus(otelSpan));
  sentrySpan.setData('otel.kind', kind.valueOf());

  Object.keys(attributes).forEach(prop => {
    const value = attributes[prop];
    sentrySpan.setData(prop, value);
  });

  const { op, description } = parseSpanDescription(otelSpan);
  sentrySpan.op = op;
  sentrySpan.description = description;
}

function updateTransactionWithOtelData(transaction: Transaction, otelSpan: OtelSpan): void {
  transaction.setContext('otel', {
    attributes: otelSpan.attributes,
    resource: otelSpan.resource.attributes,
  });

  transaction.setStatus(mapOtelStatus(otelSpan));

  const { op, description } = parseSpanDescription(otelSpan);
  transaction.op = op;
  transaction.name = description;
}

function convertOtelTimeToSeconds([seconds, nano]: [number, number]): number {
  return seconds + nano / 1_000_000_000;
}
