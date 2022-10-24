import { Context } from '@opentelemetry/api';
import { Span as OtelSpan, SpanProcessor as OtelSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getCurrentHub } from '@sentry/core';
import { Span as SentrySpan, TransactionContext } from '@sentry/types';

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor implements OtelSpanProcessor {
  private readonly _map: Record<SentrySpan['spanId'], [SentrySpan, SentrySpan | undefined]> = {};

  /**
   * @inheritDoc
   */
  public onStart(otelSpan: OtelSpan, _parentContext: Context): void {
    const hub = getCurrentHub();
    if (!hub) {
      return;
    }
    const scope = hub.getScope();
    if (!scope) {
      return;
    }

    // if isSentryRequest(otelSpan) return;

    const otelSpanId = otelSpan.spanContext().spanId;

    const sentryParentSpan = scope.getSpan();
    if (sentryParentSpan) {
      const sentryChildSpan = sentryParentSpan.startChild({
        description: otelSpan.name,
        // instrumentor: 'otel',
        startTimestamp: otelSpan.startTime[0],
      });
      sentryChildSpan.spanId = otelSpanId;
      console.log(sentryParentSpan, sentryChildSpan, otelSpan);

      this._map[otelSpanId] = [sentryChildSpan, sentryParentSpan];
      scope.setSpan(sentryChildSpan);
    } else {
      const traceCtx = getTraceData(otelSpan);
      const transaction = hub.startTransaction({
        name: otelSpan.name,
        ...traceCtx,
        // instrumentor: 'otel',
        startTimestamp: otelSpan.startTime[0],
      });
      transaction.spanId = otelSpanId;

      this._map[otelSpanId] = [transaction, undefined];

      scope.setSpan(transaction);
    }
  }

  /**
   * @inheritDoc
   */
  public onEnd(otelSpan: OtelSpan): void {
    const hub = getCurrentHub();
    if (!hub) {
      return;
    }
    const scope = hub.getScope();
    if (!scope) {
      return;
    }

    const otelSpanId = otelSpan.spanContext().spanId;
    const mapVal = this._map[otelSpanId];

    if (mapVal) {
      const [sentrySpan, sentryParentSpan] = mapVal;

      // updateSpanWithOtelData(sentrySpan, otelSpan);

      sentrySpan.finish(otelSpan.endTime[0]);
      scope.setSpan(sentryParentSpan);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this._map[otelSpanId];
    }
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
