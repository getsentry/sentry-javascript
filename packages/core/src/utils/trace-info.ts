import type { Client } from '../client';
import { getTraceContextFromScope, withScope } from '../currentScopes';
import type { Scope } from '../scope';
import {
  getDynamicSamplingContextFromScope,
  getDynamicSamplingContextFromSpan,
} from '../tracing/dynamicSamplingContext';
import type { TraceContext } from '../types-hoist/context';
import type { DynamicSamplingContext } from '../types-hoist/envelope';
import { getActiveSpan, spanToTraceContext } from './spanUtils';

/** Extract trace information from scope */
export function _getTraceInfoFromScope(
  client: Client,
  scope: Scope | undefined,
): [dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined, traceContext: TraceContext | undefined] {
  if (!scope) {
    return [undefined, undefined];
  }

  return withScope(scope, () => {
    const span = getActiveSpan();
    const traceContext = span ? spanToTraceContext(span) : getTraceContextFromScope(scope);
    const dynamicSamplingContext = span
      ? getDynamicSamplingContextFromSpan(span)
      : getDynamicSamplingContextFromScope(client, scope);
    return [dynamicSamplingContext, traceContext];
  });
}
