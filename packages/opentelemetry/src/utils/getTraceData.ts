import * as api from '@opentelemetry/api';
import type { SerializedTraceData } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

/**
 * Otel-specific implementation of `getTraceData`.
 * @see `@sentry/core` version of `getTraceData` for more information
 */
export function getTraceData(): SerializedTraceData {
  const context = api.context.active();

  // This should never happen, given we always create an ambient non-recording span if there's no active span.
  if (!context) {
    return {};
  }

  const headersObject: Record<string, string> = {};

  api.propagation.inject(context, headersObject);

  if (!headersObject['sentry-trace']) {
    return {};
  }

  return dropUndefinedKeys({
    'sentry-trace': headersObject['sentry-trace'],
    baggage: headersObject.baggage,
  });
}
