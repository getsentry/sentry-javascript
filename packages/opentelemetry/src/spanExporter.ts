import { SpanKind } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { flush } from '@sentry/core';
import type { DynamicSamplingContext, Span as SentrySpan, SpanOrigin, TransactionSource } from '@sentry/types';
import { logger } from '@sentry/utils';

import { getCurrentHub } from './custom/hub';
import type { OpenTelemetryTransaction } from './custom/transaction';
import { startTransaction } from './custom/transaction';
import { DEBUG_BUILD } from './debug-build';
import { InternalSentrySemanticAttributes } from './semanticAttributes';
import { convertOtelTimeToSeconds } from './utils/convertOtelTimeToSeconds';
import { getRequestSpanData } from './utils/getRequestSpanData';
import type { SpanNode } from './utils/groupSpansWithParents';
import { groupSpansWithParents } from './utils/groupSpansWithParents';
import { mapStatus } from './utils/mapStatus';
import { parseSpanDescription } from './utils/parseSpanDescription';
import { getSpanFinishScope, getSpanHub, getSpanMetadata, getSpanScope } from './utils/spanData';

type SpanNodeCompleted = SpanNode & { span: ReadableSpan };

/**
 * A Sentry-specific exporter that converts OpenTelemetry Spans to Sentry Spans & Transactions.
 */
export class SentrySpanExporter implements SpanExporter {
  private _finishedSpans: ReadableSpan[];
  private _stopped: boolean;

  public constructor() {
    this._stopped = false;
    this._finishedSpans = [];
  }

  /** @inheritDoc */
  public export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (this._stopped) {
      return resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error('Exporter has been stopped'),
      });
    }

    const openSpanCount = this._finishedSpans.length;
    const newSpanCount = spans.length;

    this._finishedSpans.push(...spans);

    const remainingSpans = maybeSend(this._finishedSpans);

    const remainingOpenSpanCount = remainingSpans.length;
    const sentSpanCount = openSpanCount + newSpanCount - remainingOpenSpanCount;

    DEBUG_BUILD &&
      logger.log(`SpanExporter exported ${sentSpanCount} spans, ${remainingOpenSpanCount} unsent spans remaining`);

    this._finishedSpans = remainingSpans.filter(span => {
      const shouldDrop = shouldCleanupSpan(span, 5 * 60);
      DEBUG_BUILD &&
        shouldDrop &&
        logger.log(
          `SpanExporter dropping span ${span.name} (${
            span.spanContext().spanId
          }) because it is pending for more than 5 minutes.`,
        );
      return !shouldDrop;
    });

    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  /** @inheritDoc */
  public shutdown(): Promise<void> {
    this._stopped = true;
    this._finishedSpans = [];
    return this.forceFlush();
  }

  /** @inheritDoc */
  public async forceFlush(): Promise<void> {
    await flush();
  }
}

/**
 * Send the given spans, but only if they are part of a finished transaction.
 *
 * Returns the unsent spans.
 * Spans remain unsent when their parent span is not yet finished.
 * This will happen regularly, as child spans are generally finished before their parents.
 * But it _could_ also happen because, for whatever reason, a parent span was lost.
 * In this case, we'll eventually need to clean this up.
 */
function maybeSend(spans: ReadableSpan[]): ReadableSpan[] {
  const grouped = groupSpansWithParents(spans);
  const remaining = new Set(grouped);

  const rootNodes = getCompletedRootNodes(grouped);

  rootNodes.forEach(root => {
    remaining.delete(root);
    const span = root.span;
    const transaction = createTransactionForOtelSpan(span);

    root.children.forEach(child => {
      createAndFinishSpanForOtelSpan(child, transaction, remaining);
    });

    // Now finish the transaction, which will send it together with all the spans
    // We make sure to use the finish scope
    const scope = getSpanFinishScope(span);
    transaction.finishWithScope(convertOtelTimeToSeconds(span.endTime), scope);
  });

  return Array.from(remaining)
    .map(node => node.span)
    .filter((span): span is ReadableSpan => !!span);
}

function getCompletedRootNodes(nodes: SpanNode[]): SpanNodeCompleted[] {
  return nodes.filter((node): node is SpanNodeCompleted => !!node.span && !node.parentNode);
}

function shouldCleanupSpan(span: ReadableSpan, maxStartTimeOffsetSeconds: number): boolean {
  const cutoff = Date.now() / 1000 - maxStartTimeOffsetSeconds;
  return convertOtelTimeToSeconds(span.startTime) < cutoff;
}

function parseSpan(span: ReadableSpan): { op?: string; origin?: SpanOrigin; source?: TransactionSource } {
  const attributes = span.attributes;

  const origin = attributes[InternalSentrySemanticAttributes.ORIGIN] as SpanOrigin | undefined;
  const op = attributes[InternalSentrySemanticAttributes.OP] as string | undefined;
  const source = attributes[InternalSentrySemanticAttributes.SOURCE] as TransactionSource | undefined;

  return { origin, op, source };
}

function createTransactionForOtelSpan(span: ReadableSpan): OpenTelemetryTransaction {
  const scope = getSpanScope(span);
  const hub = getSpanHub(span) || getCurrentHub();
  const spanContext = span.spanContext();
  const spanId = spanContext.spanId;
  const traceId = spanContext.traceId;
  const parentSpanId = span.parentSpanId;

  const parentSampled = span.attributes[InternalSentrySemanticAttributes.PARENT_SAMPLED] as boolean | undefined;
  const dynamicSamplingContext: DynamicSamplingContext | undefined = scope
    ? scope.getPropagationContext().dsc
    : undefined;

  const { op, description, tags, data, origin, source } = getSpanData(span);
  const metadata = getSpanMetadata(span);

  const transaction = startTransaction(hub, {
    spanId,
    traceId,
    parentSpanId,
    parentSampled,
    name: description,
    op,
    instrumenter: 'otel',
    status: mapStatus(span),
    startTimestamp: convertOtelTimeToSeconds(span.startTime),
    metadata: {
      dynamicSamplingContext,
      source,
      sampleRate: span.attributes[InternalSentrySemanticAttributes.SAMPLE_RATE] as number | undefined,
      ...metadata,
    },
    data: removeSentryAttributes(data),
    origin,
    tags,
    sampled: true,
  }) as OpenTelemetryTransaction;

  transaction.setContext('otel', {
    attributes: removeSentryAttributes(span.attributes),
    resource: span.resource.attributes,
  });

  return transaction;
}

function createAndFinishSpanForOtelSpan(node: SpanNode, sentryParentSpan: SentrySpan, remaining: Set<SpanNode>): void {
  remaining.delete(node);
  const span = node.span;

  const shouldDrop = !span;

  // If this span should be dropped, we still want to create spans for the children of this
  if (shouldDrop) {
    node.children.forEach(child => {
      createAndFinishSpanForOtelSpan(child, sentryParentSpan, remaining);
    });
    return;
  }

  const spanId = span.spanContext().spanId;
  const { attributes } = span;

  const { op, description, tags, data, origin } = getSpanData(span);
  const allData = { ...removeSentryAttributes(attributes), ...data };

  const sentrySpan = sentryParentSpan.startChild({
    description,
    op,
    data: allData,
    status: mapStatus(span),
    instrumenter: 'otel',
    startTimestamp: convertOtelTimeToSeconds(span.startTime),
    spanId,
    origin,
    tags,
  });

  node.children.forEach(child => {
    createAndFinishSpanForOtelSpan(child, sentrySpan, remaining);
  });

  sentrySpan.end(convertOtelTimeToSeconds(span.endTime));
}

function getSpanData(span: ReadableSpan): {
  tags: Record<string, string>;
  data: Record<string, unknown>;
  op?: string;
  description: string;
  source?: TransactionSource;
  origin?: SpanOrigin;
} {
  const { op: definedOp, source: definedSource, origin } = parseSpan(span);
  const { op: inferredOp, description, source: inferredSource, data: inferredData } = parseSpanDescription(span);

  const op = definedOp || inferredOp;
  const source = definedSource || inferredSource;

  const tags = getTags(span);
  const data = { ...inferredData, ...getData(span) };

  return {
    op,
    description,
    source,
    origin,
    tags,
    data,
  };
}

/**
 * Remove custom `sentry.` attribtues we do not need to send.
 * These are more carrier attributes we use inside of the SDK, we do not need to send them to the API.
 */
function removeSentryAttributes(data: Record<string, unknown>): Record<string, unknown> {
  const cleanedData = { ...data };

  /* eslint-disable @typescript-eslint/no-dynamic-delete */
  delete cleanedData[InternalSentrySemanticAttributes.PARENT_SAMPLED];
  delete cleanedData[InternalSentrySemanticAttributes.ORIGIN];
  delete cleanedData[InternalSentrySemanticAttributes.OP];
  delete cleanedData[InternalSentrySemanticAttributes.SOURCE];
  delete cleanedData[InternalSentrySemanticAttributes.SAMPLE_RATE];
  /* eslint-enable @typescript-eslint/no-dynamic-delete */

  return cleanedData;
}

function getTags(span: ReadableSpan): Record<string, string> {
  const attributes = span.attributes;
  const tags: Record<string, string> = {};

  if (attributes[SemanticAttributes.HTTP_STATUS_CODE]) {
    const statusCode = attributes[SemanticAttributes.HTTP_STATUS_CODE] as string;

    tags['http.status_code'] = statusCode;
  }

  return tags;
}

function getData(span: ReadableSpan): Record<string, unknown> {
  const attributes = span.attributes;
  const data: Record<string, unknown> = {
    'otel.kind': SpanKind[span.kind],
  };

  if (attributes[SemanticAttributes.HTTP_STATUS_CODE]) {
    const statusCode = attributes[SemanticAttributes.HTTP_STATUS_CODE] as string;
    data['http.response.status_code'] = statusCode;
  }

  const requestData = getRequestSpanData(span);

  if (requestData.url) {
    data.url = requestData.url;
  }

  if (requestData['http.query']) {
    data['http.query'] = requestData['http.query'].slice(1);
  }
  if (requestData['http.fragment']) {
    data['http.fragment'] = requestData['http.fragment'].slice(1);
  }

  return data;
}
