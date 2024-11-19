import type { Client, DynamicSamplingContext, PropagationContext, TraceContext } from '@sentry/types';
import { dropUndefinedKeys, generateSentryTraceHeader } from '@sentry/utils';
import { getCurrentScope, getGlobalScope, getIsolationScope } from './currentScopes';
import { getDynamicSamplingContextFromClient } from './tracing';

/**
 * Get a trace context for the currently active scopes.
 */
export function getTraceContextFromScopes(
  scope = getCurrentScope(),
  isolationScope = getIsolationScope(),
  globalScope = getGlobalScope(),
): TraceContext {
  const propagationContext = mergePropagationContexts(scope, isolationScope, globalScope);

  const { traceId, spanId, parentSpanId } = propagationContext;

  const traceContext: TraceContext = dropUndefinedKeys({
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: parentSpanId,
  });

  return traceContext;
}

/**
 * Get a sentry-trace header value for the currently active scopes.
 */
export function scopesToTraceHeader(
  scope = getCurrentScope(),
  isolationScope = getIsolationScope(),
  globalScope = getGlobalScope(),
): string {
  const { traceId, sampled, spanId } = mergePropagationContexts(scope, isolationScope, globalScope);
  return generateSentryTraceHeader(traceId, spanId, sampled);
}

/**
 * Get the dynamic sampling context for the currently active scopes.
 */
export function getDynamicSamplingContextFromScopes(
  client: Client,
  scope = getCurrentScope(),
  isolationScope = getIsolationScope(),
  globalScope = getGlobalScope(),
): Partial<DynamicSamplingContext> {
  const propagationContext = mergePropagationContexts(scope, isolationScope, globalScope);
  return propagationContext.dsc || getDynamicSamplingContextFromClient(propagationContext.traceId, client);
}

function mergePropagationContexts(
  scope = getCurrentScope(),
  isolationScope = getIsolationScope(),
  globalScope = getGlobalScope(),
): PropagationContext {
  return {
    ...globalScope.getPropagationContext(),
    ...isolationScope.getPropagationContext(),
    ...scope.getPropagationContext(),
  };
}
