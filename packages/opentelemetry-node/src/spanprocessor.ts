import { Context } from '@opentelemetry/api';
import { Span as OtelSpan, SpanProcessor as OtelSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getCurrentHub, withScope } from '@sentry/core';
import { Transaction } from '@sentry/tracing';
import { DynamicSamplingContext, Span as SentrySpan, TraceparentData, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY, SENTRY_TRACE_PARENT_KEY } from './constants';
import { mapOtelStatus } from './utils/map-otel-status';
import { parseSpanDescription } from './utils/parse-otel-span-description';

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor implements OtelSpanProcessor {
  // public only for testing
  public readonly _map: Map<SentrySpan['spanId'], SentrySpan> = new Map<SentrySpan['spanId'], SentrySpan>();

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

    // TODO: handle sentry requests
    // if isSentryRequest(otelSpan) return;

    const otelSpanId = otelSpan.spanContext().spanId;
    const otelParentSpanId = otelSpan.parentSpanId;

    // Otel supports having multiple non-nested spans at the same time
    // so we cannot use hub.getSpan(), as we cannot rely on this being on the current span
    const sentryParentSpan = otelParentSpanId && this._map.get(otelParentSpanId);

    if (sentryParentSpan) {
      const sentryChildSpan = sentryParentSpan.startChild({
        description: otelSpan.name,
        // instrumentor: 'otel',
        startTimestamp: otelSpan.startTime[0],
        spanId: otelSpanId,
      });

      this._map.set(otelSpanId, sentryChildSpan);
    } else {
      const traceCtx = getTraceData(otelSpan, parentContext);
      const transaction = hub.startTransaction({
        name: otelSpan.name,
        ...traceCtx,
        // instrumentor: 'otel',
        startTimestamp: otelSpan.startTime[0],
        spanId: otelSpanId,
      });

      this._map.set(otelSpanId, transaction);
    }
  }

  /**
   * @inheritDoc
   */
  public onEnd(otelSpan: OtelSpan): void {
    const otelSpanId = otelSpan.spanContext().spanId;
    const sentrySpan = this._map.get(otelSpanId);

    if (!sentrySpan) {
      __DEBUG_BUILD__ &&
        logger.error(`SentrySpanProcessor could not find span with OTEL-spanId ${otelSpanId} to finish.`);
      return;
    }

    if (sentrySpan instanceof Transaction) {
      updateTransactionWithOtelData(sentrySpan, otelSpan);
      finishTransactionWithContextFromOtelData(sentrySpan, otelSpan);
    } else {
      updateSpanWithOtelData(sentrySpan, otelSpan);
      sentrySpan.finish(otelSpan.endTime[0]);
    }

    this._map.delete(otelSpanId);
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

  const traceparentData = parentContext.getValue(SENTRY_TRACE_PARENT_KEY) as TraceparentData | undefined;
  const dynamicSamplingContext = parentContext.getValue(SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY) as
    | Partial<DynamicSamplingContext>
    | undefined;

  return {
    spanId,
    traceId,
    parentSpanId,
    metadata: {
      // only set dynamic sampling context if sentry-trace header was set
      dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
      source: 'custom',
    },
  };
}

function finishTransactionWithContextFromOtelData(transaction: Transaction, otelSpan: OtelSpan): void {
  withScope(scope => {
    scope.setContext('otel', {
      attributes: otelSpan.attributes,
      resource: otelSpan.resource.attributes,
    });

    transaction.finish(otelSpan.endTime[0]);
  });
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
  transaction.setStatus(mapOtelStatus(otelSpan));
}
