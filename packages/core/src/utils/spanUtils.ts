import type { Span } from '@sentry/types';
import { generateSentryTraceHeader } from '@sentry/utils';

/**
 * Convert a Span to a Sentry trace header.
 */
export function spanToTraceHeader(span: Span): string {
  return generateSentryTraceHeader(span.traceId, span.spanId, span.sampled);
}
