import type { TraceContext } from '../types/context';
import type { Event, EventHint } from '../types/event';
import type { Span } from '../types/span';
import { isPrimitive } from './is';
import { spanToTraceContext } from './spanUtils';

/**
 * The trace context of the span an error escaped, keyed by the error itself.
 *
 * We store the plain trace context rather than the span, so that an error object cannot keep a
 * whole span tree alive for as long as it is referenced.
 */
const escapedSpanTraceContexts = new WeakMap<object, TraceContext>();

function toKey(error: unknown): object | undefined {
  return isPrimitive(error) ? undefined : error;
}

/**
 * Remember which span an error escaped, so a later `captureException` can attribute the error to
 * the span that actually failed instead of whichever span happens to be active at capture time.
 *
 * The first span to see the error wins: as an error unwinds through nested spans, the innermost
 * one is the one that failed. Non-recording spans are skipped because they are never sent, so
 * their span id would point at a span that does not exist.
 */
export function recordEscapedErrorSpan(error: unknown, span: Span): void {
  const key = toKey(error);

  if (!key || !span.isRecording() || escapedSpanTraceContexts.has(key)) {
    return;
  }

  escapedSpanTraceContexts.set(key, spanToTraceContext(span));
}

/**
 * Attribute an error event to the span the error escaped, if we recorded one.
 *
 * This only applies within the error's own trace. The stored span id is meaningless in another
 * trace, and the event's dynamic sampling context (which the envelope header is built from) is
 * derived from the root span of the trace the event is already on. Rewriting the trace id here
 * would leave the envelope header and body naming different traces.
 */
export function applyEscapedErrorSpanToEvent(event: Event, hint: EventHint): void {
  const key = toKey(hint.originalException);
  const traceContext = key && escapedSpanTraceContexts.get(key);
  const eventTraceContext = event.contexts?.trace;

  if (!traceContext || !eventTraceContext || eventTraceContext.trace_id !== traceContext.trace_id) {
    return;
  }

  event.contexts = {
    ...event.contexts,
    trace: {
      ...eventTraceContext,
      span_id: traceContext.span_id,
      parent_span_id: traceContext.parent_span_id,
    },
  };
}
