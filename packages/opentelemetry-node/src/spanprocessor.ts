import { Context } from '@opentelemetry/api';
import { Span as OtelSpan, SpanProcessor as OtelSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getCurrentHub, withScope } from '@sentry/core';
import { Transaction } from '@sentry/tracing';
import { Span as SentrySpan, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

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
      const traceCtx = getTraceData(otelSpan);
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

    if (sentrySpan instanceof Transaction) {
      updateTransactionWithOtelData(sentrySpan, otelSpan);
      finishTransactionWithContextFromOtelData(sentrySpan, otelSpan);
    } else {
      updateSpanWithOtelData(sentrySpan, otelSpan);
      sentrySpan.finish(convertOtelTimeToSeconds(otelSpan.endTime));
    }

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

function getTraceData(otelSpan: OtelSpan): Partial<TransactionContext> {
  const spanContext = otelSpan.spanContext();
  const traceId = spanContext.traceId;
  const spanId = spanContext.spanId;

  const parentSpanId = otelSpan.parentSpanId;
  return { spanId, traceId, parentSpanId };
}

function finishTransactionWithContextFromOtelData(transaction: Transaction, otelSpan: OtelSpan): void {
  withScope(scope => {
    scope.setContext('otel', {
      attributes: otelSpan.attributes,
      resource: otelSpan.resource.attributes,
    });

    transaction.finish(convertOtelTimeToSeconds(otelSpan.endTime));
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

  const { op, description } = parseSpanDescription(otelSpan);
  transaction.op = op;
  transaction.name = description;
}

function convertOtelTimeToSeconds([seconds, nano]: [number, number]): number {
  return seconds + nano / 1_000_000_000;
}
