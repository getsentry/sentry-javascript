import type { Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { getCurrentHub, isSentryRequestUrl } from '@sentry/core';

/**
 *
 * @param otelSpan Checks wheter a given OTEL Span is an http request to sentry.
 * @returns boolean
 */
export function isSentryRequestSpan(otelSpan: OtelSpan): boolean {
  const { attributes } = otelSpan;

  const httpUrl = attributes[SemanticAttributes.HTTP_URL];

  if (!httpUrl) {
    return false;
  }

  return isSentryRequestUrl(httpUrl.toString(), getCurrentHub());
}
