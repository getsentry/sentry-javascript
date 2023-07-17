import type { Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { getCurrentHub } from '@sentry/core';

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

  return isSentryRequestUrl(httpUrl.toString());
}

/**
 * Checks whether given url points to Sentry server
 * @param url url to verify
 */
function isSentryRequestUrl(url: string): boolean {
  const dsn = getCurrentHub().getClient()?.getDsn();
  return dsn ? url.includes(dsn.host) : false;
}
