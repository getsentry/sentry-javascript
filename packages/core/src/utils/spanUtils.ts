// oxlint-disable max-lines
import { getAsyncContextStrategy } from '../asyncContext';
import type { RawAttributes } from '../attributes';
import { serializeAttributes } from '../attributes';
import { getMainCarrier } from '../carrier';
import { getCurrentScope } from '../currentScopes';
import type { Scope } from '../scope';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_STATUS_MESSAGE,
} from '../semanticAttributes';
import type { SentrySpan } from '../tracing/sentrySpan';
import { isStatusErrorMessageValid, SPAN_STATUS_OK, SPAN_STATUS_UNSET } from '../tracing/spanstatus';
import { getCapturedScopesOnSpan } from '../tracing/utils';
import type { TraceContext } from '../types/context';
import type { SpanLink, SpanLinkJSON } from '../types/link';
import type {
  SerializedStreamedSpan,
  Span,
  SpanAttributes,
  SpanJSON,
  SpanTimeInput,
  StreamedSpanJSON,
} from '../types/span';
import type { SpanStatus } from '../types/spanStatus';
import { addNonEnumerableProperty } from '../utils/object';
import { generateSpanId } from '../utils/propagationContext';
import { timestampInSeconds } from '../utils/time';
import { generateSentryTraceHeader, generateTraceparentHeader } from '../utils/tracing';
import { _getSpanForScope } from './spanOnScope';

// These are aligned with OpenTelemetry trace flags
export const TRACE_FLAG_NONE = 0x0;
export const TRACE_FLAG_SAMPLED = 0x1;

/**
 * Convert a span to a trace context, which can be sent as the `trace` context in an event.
 * By default, this will only include trace_id, span_id & parent_span_id.
 * If `includeAllData` is true, it will also include data, op, status & origin.
 */
export function spanToTransactionTraceContext(span: Span): TraceContext {
  const { spanId: span_id, traceId: trace_id } = span.spanContext();
  const { data, op, parent_span_id, status, origin, links } = spanToStaticSpanJSON(span);

  return {
    parent_span_id,
    span_id,
    trace_id,
    data,
    op,
    status,
    origin,
    links,
  };
}

/**
 * Convert a span to a trace context, which can be sent as the `trace` context in a non-transaction event.
 */
export function spanToTraceContext(span: Span): TraceContext {
  const { spanId, traceId: trace_id, isRemote } = span.spanContext();

  // If the span is remote, we use a random/virtual span as span_id to the trace context,
  // and the remote span as parent_span_id
  const parent_span_id = isRemote ? spanId : spanToStaticSpanJSON(span).parent_span_id;
  const scope = getCapturedScopesOnSpan(span).scope;

  const span_id = isRemote ? scope?.getPropagationContext().propagationSpanId || generateSpanId() : spanId;

  return {
    parent_span_id,
    span_id,
    trace_id,
  };
}

/**
 * Convert a Span to a Sentry trace header.
 */
export function spanToTraceHeader(span: Span): string {
  const { traceId, spanId } = span.spanContext();
  const sampled = spanIsSampled(span);
  return generateSentryTraceHeader(traceId, spanId, sampled);
}

/**
 * Convert a Span to a W3C traceparent header.
 */
export function spanToTraceparentHeader(span: Span): string {
  const { traceId, spanId } = span.spanContext();
  const sampled = spanIsSampled(span);
  return generateTraceparentHeader(traceId, spanId, sampled);
}

/**
 *  Converts the span links array to a flattened version to be sent within an envelope.
 *
 *  If the links array is empty, it returns `undefined` so the empty value can be dropped before it's sent.
 */
export function convertSpanLinksForEnvelope(links?: SpanLink[]): SpanLinkJSON[] | undefined {
  if (links && links.length > 0) {
    return links.map(({ context: { spanId, traceId, traceFlags, ...restContext }, attributes }) => ({
      span_id: spanId,
      trace_id: traceId,
      sampled: traceFlags === TRACE_FLAG_SAMPLED,
      attributes,
      ...restContext,
    }));
  } else {
    return undefined;
  }
}

/**
 * Converts the span links array to a flattened version with serialized attributes for V2 spans.
 *
 * If the links array is empty, it returns `undefined` so the empty value can be dropped before it's sent.
 */
export function getStreamedSpanLinks(
  links?: SpanLink[],
): SpanLinkJSON<RawAttributes<Record<string, unknown>>>[] | undefined {
  if (links?.length) {
    return links.map(({ context: { spanId, traceId, traceFlags }, attributes }) => ({
      span_id: spanId,
      trace_id: traceId,
      sampled: traceFlags === TRACE_FLAG_SAMPLED,
      attributes,
    }));
  } else {
    return undefined;
  }
}

/**
 * Convert a span time input into a timestamp in seconds.
 */
export function spanTimeInputToSeconds(input: SpanTimeInput | undefined): number {
  if (typeof input === 'number') {
    return ensureTimestampInSeconds(input);
  }

  if (Array.isArray(input)) {
    // See {@link HrTime} for the array-based time format
    return input[0] + input[1] / 1e9;
  }

  if (input instanceof Date) {
    return ensureTimestampInSeconds(input.getTime());
  }

  return timestampInSeconds();
}

/**
 * Converts a timestamp to second, if it was in milliseconds, or keeps it as second.
 */
function ensureTimestampInSeconds(timestamp: number): number {
  const isMs = timestamp > 9999999999;
  return isMs ? timestamp / 1000 : timestamp;
}

/**
 * Convert a span to a static JSON representation.
 */
// Note: Because of this, we currently have a circular type dependency (which we opted out of in package.json).
// This is not avoidable as we need `spanToJSON` in `spanUtils.ts`, which in turn is needed by `sentrySpan.ts` for backwards compatibility.
// And `spanToJSON` needs the Span class from `span.ts` to check here.
export function spanToStaticSpanJSON(span: Span): SpanJSON {
  if (spanIsSentrySpan(span)) {
    return span.getStaticSpanJSON();
  }

  // because `spanToJSON` accepts a `Span` interface rather than a `SentrySpan` instance,
  // we need to handle the case where the span is not a Sentry span.
  // This should not actually happen in reality, but we need to handle it for type safety.
  const ctx = span.spanContext();
  return {
    span_id: ctx.spanId,
    trace_id: ctx.traceId,
    start_timestamp: 0,
    status: 'ok',
    data: {},
  };
}

/**
 * Convert a span to a JSON representation.
 */
export function spanToJSON(span: Span): StreamedSpanJSON {
  return span.getSpanJSON();
}

/**
 * Converts a {@link StreamedSpanJSON} to a {@link SerializedSpan}.
 * This is the final serialized span format that is sent to Sentry.
 * The returned serilaized spans must not be consumed by users or SDK integrations.
 */
export function streamedSpanJsonToSerializedSpan(spanJson: StreamedSpanJSON): SerializedStreamedSpan {
  return {
    ...spanJson,
    // We only ever send ended spans, but fall back to the start time (i.e. duration 0) so that
    // sent spans always carry an end timestamp.
    end_timestamp: spanJson.end_timestamp ?? spanJson.start_timestamp,
    attributes: serializeAttributes(spanJson.attributes),
    links: spanJson.links?.map(link => ({
      ...link,
      attributes: serializeAttributes(link.attributes),
    })),
  };
}

/**
 * Sadly, due to circular dependency checks we cannot actually import the Span class here and check for instanceof.
 * :( So instead we approximate this by checking if it has the `getSpanJSON` method.
 */
export function spanIsSentrySpan(span: Span): span is SentrySpan {
  return typeof (span as SentrySpan).getStaticSpanJSON === 'function';
}

/**
 * Returns true if a span is sampled.
 * In most cases, you should just use `span.isRecording()` instead.
 * However, this has a slightly different semantic, as it also returns false if the span is finished.
 * So in the case where this distinction is important, use this method.
 */
export function spanIsSampled(span: Span): boolean {
  // We align our trace flags with the ones OpenTelemetry use
  // So we also check for sampled the same way they do.
  const { traceFlags } = span.spanContext();
  return traceFlags === TRACE_FLAG_SAMPLED;
}

/** Get the status message to use for a JSON representation of a span. */
export function getStatusMessage(status: SpanStatus | undefined): string {
  if (!status || status.code === SPAN_STATUS_UNSET) {
    return 'ok';
  }

  if (status.code === SPAN_STATUS_OK) {
    return 'ok';
  }

  return status.message && isStatusErrorMessageValid(status.message) ? status.message : 'internal_error';
}

/**
 * Convert the various statuses to the simple ones expected by Sentry for streamed spans ('ok' is default).
 */
export function getSimpleStatus(status: SpanStatus | undefined): 'ok' | 'error' {
  return !status ||
    status.code === SPAN_STATUS_OK ||
    status.code === SPAN_STATUS_UNSET ||
    status.message === 'cancelled'
    ? 'ok'
    : 'error';
}

/**
 * Returns the span's attributes with the SEMANTIC_ATTRIBUTE_SENTRY_STATUS_MESSAGE attribute added
 * if the span has an error status message worth preserving.
 *
 * An explicitly set attribute is never overwritten.
 */
export function addStatusMessageAttribute(
  attributes: SpanAttributes,
  status: SpanStatus | undefined,
): RawAttributes<Record<string, unknown>> {
  const statusMessage = getSimpleStatus(status) === 'error' ? status?.message : undefined;
  return {
    ...(statusMessage && { [SEMANTIC_ATTRIBUTE_SENTRY_STATUS_MESSAGE]: statusMessage }),
    ...attributes,
  };
}

const CHILD_SPANS_FIELD = '_sentryChildSpans';
const ROOT_SPAN_FIELD = '_sentryRootSpan';

type SpanWithPotentialChildren = Span & {
  [CHILD_SPANS_FIELD]?: Set<Span>;
  [ROOT_SPAN_FIELD]?: Span;
};

/**
 * Adds an opaque child span reference to a span.
 */
export function addChildSpanToSpan(span: SpanWithPotentialChildren, childSpan: Span): void {
  // We store the root span reference on the child span
  // We need this for `getRootSpan()` to work
  const rootSpan = span[ROOT_SPAN_FIELD] || span;
  addNonEnumerableProperty(childSpan, ROOT_SPAN_FIELD, rootSpan);

  // `_sentryChildSpans` exists only so `getSpanDescendants()` can walk the tree when the segment span
  // is sent, and that walk stops at an unsampled span without ever visiting its children. So a child
  // tracked here would be held for the parent's lifetime and never read.
  if (!spanIsSampled(span)) {
    return;
  }

  // Once the segment span stopped recording, the tree has been read for the last time, and a child
  // starting now belongs to whatever segment comes next: it is re-emitted on its own instead. Tracking
  // it here would pin it for as long as the parent lives, which for a span left active in an async
  // context (e.g. a framework boot span captured by a queue consumer) is the rest of the process. Only
  // a parent that is itself still recording keeps tracking, so a late child that outlives its segment
  // still collects the subtree it is re-emitted with.
  if (!span.isRecording() && !rootSpan.isRecording()) {
    return;
  }

  // We store a list of child spans on the parent span
  // We need this for `getSpanDescendants()` to work
  if (span[CHILD_SPANS_FIELD]) {
    span[CHILD_SPANS_FIELD].add(childSpan);
  } else {
    addNonEnumerableProperty(span, CHILD_SPANS_FIELD, new Set([childSpan]));
  }
}

/** This is only used internally by Idle Spans. */
export function removeChildSpanFromSpan(span: SpanWithPotentialChildren, childSpan: Span): void {
  if (span[CHILD_SPANS_FIELD]) {
    span[CHILD_SPANS_FIELD].delete(childSpan);
  }
}

/**
 * Returns an array of the given span and all of its descendants.
 */
export function getSpanDescendants(span: SpanWithPotentialChildren): Span[] {
  const resultSet = new Set<Span>();

  function addSpanChildren(span: SpanWithPotentialChildren): void {
    // This exit condition is required to not infinitely loop in case of a circular dependency.
    if (resultSet.has(span)) {
      return;
      // We want to ignore unsampled spans (e.g. non recording spans)
    } else if (spanIsSampled(span)) {
      resultSet.add(span);
      const childSpans = span[CHILD_SPANS_FIELD] ? Array.from(span[CHILD_SPANS_FIELD]) : [];
      for (const childSpan of childSpans) {
        addSpanChildren(childSpan);
      }
    }
  }

  addSpanChildren(span);

  return Array.from(resultSet);
}

/**
 * Returns the root span of a given span.
 */
export const getRootSpan = INTERNAL_getSegmentSpan;

/**
 * Returns the segment span of a given span.
 */
export function INTERNAL_getSegmentSpan(span: SpanWithPotentialChildren): Span {
  return span[ROOT_SPAN_FIELD] || span;
}

/**
 * Returns the currently active span.
 */
export function getActiveSpan(scope?: Scope): Span | undefined {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  if (acs.getActiveSpan) {
    return acs.getActiveSpan(scope);
  }

  return _getSpanForScope(scope || getCurrentScope());
}

/**
 * Updates the name of the given span and ensures that the span name is not
 * overwritten by the Sentry SDK.
 *
 * Use this function instead of `span.updateName()` if you want to make sure that
 * your name is kept. For some spans, for example root `http.server` spans the
 * Sentry SDK would otherwise overwrite the span name with a high-quality name
 * it infers when the span ends.
 *
 * Use this function in server code or when your span is started on the server
 * and on the client (browser). If you only update a span name on the client,
 * you can also use `span.updateName()` the SDK does not overwrite the name.
 *
 * @param span - The span to update the name of.
 * @param name - The name to set on the span.
 */
export function updateSpanName(span: Span, name: string): void {
  span.updateName(name);
  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
    [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: name,
  });
}
