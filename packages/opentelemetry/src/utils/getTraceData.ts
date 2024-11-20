import * as api from '@opentelemetry/api';
import { getCapturedScopesOnSpan } from '@sentry/core';
import type { SerializedTraceData, Span } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import { getContextFromScope } from './contextData';

/**
 * Otel-specific implementation of `getTraceData`.
 * @see `@sentry/core` version of `getTraceData` for more information
 */
export function getTraceData({ span }: { span?: Span } = {}): SerializedTraceData {
  const headersObject: Record<string, string> = {};

  if (span) {
    const { scope } = getCapturedScopesOnSpan(span);
    // fall back to current context if for whatever reason we can't find the one of the span
    const ctx = (scope && getContextFromScope(scope)) || api.trace.setSpan(api.context.active(), span);

    api.propagation.inject(ctx, headersObject);
  } else {
    api.propagation.inject(api.context.active(), headersObject);
  }

  if (!headersObject['sentry-trace']) {
    return {};
  }

  return dropUndefinedKeys({
    'sentry-trace': headersObject['sentry-trace'],
    baggage: headersObject.baggage,
  });
}
