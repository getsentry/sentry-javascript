import type { Span as SentrySpan } from '@sentry/types';

interface SpanMapEntry {
  sentrySpan: SentrySpan;
  ref: SpanRefType;
  // These are not direct children, but all spans under the tree of a root span.
  subSpans: string[];
}

const SPAN_REF_ROOT = Symbol('root');
const SPAN_REF_CHILD = Symbol('child');
const SPAN_REF_CHILD_ENDED = Symbol('child_ended');
type SpanRefType = typeof SPAN_REF_ROOT | typeof SPAN_REF_CHILD | typeof SPAN_REF_CHILD_ENDED;

/** Exported only for tests. */
export const SPAN_MAP = new Map<string, SpanMapEntry>();

/**
 * Get a Sentry span for a given span ID.
 */
export function getSentrySpan(spanId: string): SentrySpan | undefined {
  const entry = SPAN_MAP.get(spanId);
  return entry ? entry.sentrySpan : undefined;
}

/**
 * Set a Sentry span for a given span ID.
 * This is necessary so we can lookup parent spans later.
 * We also keep a list of children for root spans only, in order to be able to clean them up together.
 */
export function setSentrySpan(spanId: string, sentrySpan: SentrySpan): void {
  let ref: SpanRefType = SPAN_REF_ROOT;

  const rootSpanId = sentrySpan.transaction?.spanId;

  if (rootSpanId && rootSpanId !== spanId) {
    const root = SPAN_MAP.get(rootSpanId);
    if (root) {
      root.subSpans.push(spanId);
      ref = SPAN_REF_CHILD;
    }
  }

  SPAN_MAP.set(spanId, {
    sentrySpan,
    ref,
    subSpans: [],
  });
}

/**
 * Clear references of the given span ID.
 */
export function clearSpan(spanId: string): void {
  const entry = SPAN_MAP.get(spanId);
  if (!entry) {
    return;
  }

  const { ref, subSpans } = entry;

  // If this is a child, mark it as ended.
  if (ref === SPAN_REF_CHILD) {
    entry.ref = SPAN_REF_CHILD_ENDED;
    return;
  }

  // If this is a root span, clear all (ended) children
  if (ref === SPAN_REF_ROOT) {
    for (const childId of subSpans) {
      const child = SPAN_MAP.get(childId);
      if (!child) {
        continue;
      }

      if (child.ref === SPAN_REF_CHILD_ENDED) {
        // if the child has already ended, just clear it
        SPAN_MAP.delete(childId);
      } else if (child.ref === SPAN_REF_CHILD) {
        // If the child has not ended yet, mark it as a root span so it is cleared when it ends.
        child.ref = SPAN_REF_ROOT;
      }
    }

    SPAN_MAP.delete(spanId);
    return;
  }

  // Generally, `clearSpan` should never be called for ref === SPAN_REF_CHILD_ENDED
  // But if it does, just clear the span
  SPAN_MAP.delete(spanId);
}
