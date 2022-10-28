import { Context } from '@opentelemetry/api';
import { Span as OtelSpan, SpanProcessor as OtelSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getCurrentHub } from '@sentry/core';
import { Span as SentrySpan, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

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
  public onStart(otelSpan: OtelSpan, _parentContext: Context): void {
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
      const traceCtx = getTraceData(otelSpan);
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
    const mapVal = this._map.get(otelSpanId);

    if (!mapVal) {
      __DEBUG_BUILD__ &&
        logger.error(`SentrySpanProcessor could not find span with OTEL-spanId ${otelSpanId} to finish.`);
      return;
    }

    const sentrySpan = mapVal;

    // TODO: actually add context etc. to span
    // updateSpanWithOtelData(sentrySpan, otelSpan);

    sentrySpan.finish(otelSpan.endTime[0]);

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

function getTraceData(otelSpan: OtelSpan): Partial<TransactionContext> {
  const spanContext = otelSpan.spanContext();
  const traceId = spanContext.traceId;
  const spanId = spanContext.spanId;

  const parentSpanId = otelSpan.parentSpanId;
  return { spanId, traceId, parentSpanId };
}

// function updateSpanWithOtelData(sentrySpan: SentrySpan, otelSpan: OtelSpan): void {
// }
