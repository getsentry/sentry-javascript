import type { Client, Scope, Span } from '@sentry/types';
import { dynamicSamplingContextToSentryBaggageHeader, generateSentryTraceHeader } from '@sentry/utils';
import { getCurrentScope } from '../currentScopes';
import { spanToTraceHeader } from '../utils/spanUtils';
import { getDynamicSamplingContextFromScope, getDynamicSamplingContextFromSpan } from './dynamicSamplingContext';

/**
 * Get the sentry-trace and baggage headers for a given span or scope.
 * If no scope is defined, it will use the current scope.
 */
export function getSentryHeaders({
  span,
  client,
  scope = getCurrentScope(),
}: { span?: Span; client: Client; scope?: Scope }): {
  sentryTrace: string;
  baggage: string | undefined;
} {
  const sentryTrace = span ? spanToTraceHeader(span) : scopesToTraceHeader(scope);
  const dsc = span ? getDynamicSamplingContextFromSpan(span) : getDynamicSamplingContextFromScope(client, scope);
  const baggage = dynamicSamplingContextToSentryBaggageHeader(dsc);

  return {
    sentryTrace,
    baggage,
  };
}

/**
 * Get a sentry-trace header value for the given scope.
 */
function scopesToTraceHeader(scope: Scope): string {
  const { traceId, sampled, spanId } = scope.getPropagationContext();
  return generateSentryTraceHeader(traceId, spanId, sampled);
}
