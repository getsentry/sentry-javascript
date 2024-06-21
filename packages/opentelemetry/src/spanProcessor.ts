import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT, SpanKind, trace } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor as SpanProcessorInterface } from '@opentelemetry/sdk-trace-base';
import { SEMATTRS_HTTP_STATUS_CODE } from '@opentelemetry/semantic-conventions';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  addChildSpanToSpan,
  captureEvent,
  getCapturedScopesOnSpan,
  getClient,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getDynamicSamplingContextFromSpan,
  getMetricSummaryJsonForSpan,
  getSpanDescendants,
  getStatusMessage,
  logSpanEnd,
  logSpanStart,
  setCapturedScopesOnSpan,
  timedEventsToMeasurements,
} from '@sentry/core';
import type { SpanJSON, SpanOrigin, TraceContext, TransactionEvent, TransactionSource } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import { SENTRY_TRACE_STATE_PARENT_SPAN_ID } from './constants';
import { SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE } from './semanticAttributes';
import { getScopesFromContext } from './utils/contextData';
import { convertOtelTimeToSeconds } from './utils/convertOtelTimeToSeconds';
import { getRequestSpanData } from './utils/getRequestSpanData';
import { getLocalParentId } from './utils/groupSpansWithParents';
import { mapStatus } from './utils/mapStatus';
import { parseSpanDescription } from './utils/parseSpanDescription';
import { setIsSetup } from './utils/setupCheck';

const MAX_SPAN_COUNT = 1000;

function onSpanStart(span: Span, parentContext: Context): void {
  // This is a reliable way to get the parent span - because this is exactly how the parent is identified in the OTEL SDK
  const parentSpan = trace.getSpan(parentContext);

  let scopes = getScopesFromContext(parentContext);

  // We need access to the parent span in order to be able to move up the span tree for breadcrumbs
  if (parentSpan && !parentSpan.spanContext().isRemote) {
    addChildSpanToSpan(parentSpan, span);
  }

  // We need this in the span exporter
  if (parentSpan && parentSpan.spanContext().isRemote) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE, true);
  }

  // The root context does not have scopes stored, so we check for this specifically
  // As fallback we attach the global scopes
  if (parentContext === ROOT_CONTEXT) {
    scopes = {
      scope: getDefaultCurrentScope(),
      isolationScope: getDefaultIsolationScope(),
    };
  }

  // We need the scope at time of span creation in order to apply it to the event when the span is finished
  if (scopes) {
    setCapturedScopesOnSpan(span, scopes.scope, scopes.isolationScope);
  }

  logSpanStart(span);

  const client = getClient();
  client?.emit('spanStart', span);
}

function onSpanEnd(span: Span): void {
  logSpanEnd(span);

  const client = getClient();
  client?.emit('spanEnd', span);
}

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor implements SpanProcessorInterface {
  public constructor() {
    setIsSetup('SentrySpanProcessor');
  }

  /**
   * @inheritDoc
   */
  public async forceFlush(): Promise<void> {
    // noop
  }

  /**
   * @inheritDoc
   */
  public async shutdown(): Promise<void> {
    // noop
  }

  /**
   * @inheritDoc
   */
  public onStart(span: Span, parentContext: Context): void {
    onSpanStart(span, parentContext);
  }

  /** @inheritDoc */
  public onEnd(span: Span & ReadableSpan): void {
    onSpanEnd(span);

    // TODO: Explain this check
    if (!getLocalParentId(span)) {
      // TODO: Explain this timeout
      setTimeout(() => {
        sendRootSpan(span);
      }, 1);
    }
  }
}

function sendRootSpan(span: Span & ReadableSpan): void {
  const transactionEvent = createTransactionForOtelSpan(span);
  let childSpans = (getSpanDescendants(span) as Span[])
    .filter(descendant => descendant !== span)
    .map(span => createSpanForOtelSpan(span));

  if (childSpans.length > MAX_SPAN_COUNT) {
    // TODO: Explain why we sort
    childSpans.sort((a, b) => a.start_timestamp - b.start_timestamp);
    childSpans = childSpans.slice(0, MAX_SPAN_COUNT);
  }

  transactionEvent.spans = childSpans;

  const measurements = timedEventsToMeasurements(span.events);
  if (measurements) {
    transactionEvent.measurements = measurements;
  }

  captureEvent(transactionEvent);
}

function createSpanForOtelSpan(span: Span): SpanJSON {
  const span_id = span.spanContext().spanId;
  const trace_id = span.spanContext().traceId;

  const { attributes, startTime, endTime, parentSpanId } = span;

  const { op, description, data, origin = 'manual' } = getSpanData(span);
  const allData = dropUndefinedKeys({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    ...removeSentryAttributes(attributes),
    ...data,
  });

  const status = mapStatus(span);

  return dropUndefinedKeys({
    span_id,
    trace_id,
    data: allData,
    description,
    parent_span_id: parentSpanId,
    start_timestamp: convertOtelTimeToSeconds(startTime),
    // This is [0,0] by default in OTEL, in which case we want to interpret this as no end time
    timestamp: convertOtelTimeToSeconds(endTime) || undefined,
    status: getStatusMessage(status), // As per protocol, span status is allowed to be undefined
    op,
    origin,
    _metrics_summary: getMetricSummaryJsonForSpan(span as unknown as Span),
    measurements: timedEventsToMeasurements(span.events),
  });
}

function parseSpan(span: ReadableSpan): { op?: string; origin?: SpanOrigin; source?: TransactionSource } {
  const attributes = span.attributes;

  const origin = attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] as SpanOrigin | undefined;
  const op = attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] as string | undefined;
  const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] as TransactionSource | undefined;

  return { origin, op, source };
}

function getSpanData(span: ReadableSpan): {
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

  const data = { ...inferredData, ...getData(span) };

  return {
    op,
    description,
    source,
    origin,
    data,
  };
}

function getData(span: ReadableSpan): Record<string, unknown> {
  const attributes = span.attributes;
  const data: Record<string, unknown> = {
    'otel.kind': SpanKind[span.kind],
  };

  if (attributes[SEMATTRS_HTTP_STATUS_CODE]) {
    const statusCode = attributes[SEMATTRS_HTTP_STATUS_CODE] as string;
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

/**
 * Remove custom `sentry.` attribtues we do not need to send.
 * These are more carrier attributes we use inside of the SDK, we do not need to send them to the API.
 */
function removeSentryAttributes(data: Record<string, unknown>): Record<string, unknown> {
  const cleanedData = { ...data };

  /* eslint-disable @typescript-eslint/no-dynamic-delete */
  delete cleanedData[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE];
  delete cleanedData[SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE];
  /* eslint-enable @typescript-eslint/no-dynamic-delete */

  return cleanedData;
}

function createTransactionForOtelSpan(span: ReadableSpan): TransactionEvent {
  const { op, description, data, origin = 'manual', source } = getSpanData(span);
  const capturedSpanScopes = getCapturedScopesOnSpan(span as unknown as Span);

  const sampleRate = span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE] as number | undefined;

  const attributes = dropUndefinedKeys({
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: sampleRate,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    ...data,
    ...removeSentryAttributes(span.attributes),
  });

  const { traceId: trace_id, spanId: span_id } = span.spanContext();

  const parentSpanIdFromTraceState = span.spanContext().traceState?.get(SENTRY_TRACE_STATE_PARENT_SPAN_ID);

  // If parentSpanIdFromTraceState is defined at all, we want it to take presedence
  // In that case, an empty string should be interpreted as "no parent span id",
  // even if `span.parentSpanId` is set
  // this is the case when we are starting a new trace, where we have a virtual span based on the propagationContext
  // We only want to continue the traceId in this case, but ignore the parent span
  const parent_span_id =
    typeof parentSpanIdFromTraceState === 'string' ? parentSpanIdFromTraceState || undefined : span.parentSpanId;

  const status = mapStatus(span);

  const traceContext = dropUndefinedKeys({
    parent_span_id,
    span_id,
    trace_id,
    data: attributes,
    origin,
    op,
    status: getStatusMessage(status), // As per protocol, span status is allowed to be undefined
  }) satisfies TraceContext;

  const transactionEvent = {
    contexts: {
      trace: traceContext,
      otel: {
        resource: span.resource.attributes,
      },
    },
    spans: [],
    start_timestamp: convertOtelTimeToSeconds(span.startTime),
    timestamp: convertOtelTimeToSeconds(span.endTime),
    transaction: description,
    type: 'transaction',
    sdkProcessingMetadata: {
      ...dropUndefinedKeys({
        capturedSpanScope: capturedSpanScopes.scope,
        capturedSpanIsolationScope: capturedSpanScopes.isolationScope,
        sampleRate,
        dynamicSamplingContext: getDynamicSamplingContextFromSpan(span as unknown as Span),
      }),
    },
    ...(source && {
      transaction_info: {
        source,
      },
    }),
    _metrics_summary: getMetricSummaryJsonForSpan(span as unknown as Span),
  } satisfies TransactionEvent;

  return transactionEvent;
}
