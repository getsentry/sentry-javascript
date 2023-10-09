import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';

import { getSpanParent } from '../opentelemetry/spanData';

/**
 * Returns the currently active span.
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Get the root span for the given span.
 * The given span may be the root span itself.
 */
export function getRootSpan(span: Span): Span {
  let parent: Span = span;

  while (getSpanParent(parent)) {
    parent = getSpanParent(parent) as Span;
  }

  return parent;
}
