import { trace } from '@opentelemetry/api';

import { getOtelSpanParent } from '../opentelemetry/spanData';
import type { OtelSpan } from '../types';

/**
 * Returns the currently active span.
 */
export function getActiveSpan(): OtelSpan | undefined {
  return trace.getActiveSpan() as OtelSpan | undefined;
}

/**
 * Get the root span for the given span.
 * The given span may be the root span itself.
 */
export function getRootSpan(span: OtelSpan): OtelSpan {
  let parent = span;

  while (getOtelSpanParent(parent)) {
    parent = getOtelSpanParent(parent) as OtelSpan;
  }

  return parent;
}
