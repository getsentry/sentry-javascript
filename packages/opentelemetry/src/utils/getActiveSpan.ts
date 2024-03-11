import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';

/**
 * Returns the currently active span.
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}
