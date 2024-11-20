import * as api from '@opentelemetry/api';
import { dropUndefinedKeys } from '@sentry/core';
import type { SerializedTraceData } from '@sentry/types';

/**
 * Otel-specific implementation of `getTraceData`.
 * @see `@sentry/core` version of `getTraceData` for more information
 */
export function getTraceData(): SerializedTraceData {
  const headersObject: Record<string, string> = {};

  api.propagation.inject(api.context.active(), headersObject);

  if (!headersObject['sentry-trace']) {
    return {};
  }

  return dropUndefinedKeys({
    'sentry-trace': headersObject['sentry-trace'],
    baggage: headersObject.baggage,
  });
}
