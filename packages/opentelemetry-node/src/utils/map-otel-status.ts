import type { Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { SpanStatusType as SentryStatus } from '@sentry/tracing';

// canonicalCodesHTTPMap maps some HTTP codes to Sentry's span statuses. See possible mapping in https://develop.sentry.dev/sdk/event-payloads/span/
const canonicalCodesHTTPMap: Record<string, SentryStatus> = {
  '400': 'failed_precondition',
  '401': 'unauthenticated',
  '403': 'permission_denied',
  '404': 'not_found',
  '409': 'aborted',
  '429': 'resource_exhausted',
  '499': 'cancelled',
  '500': 'internal_error',
  '501': 'unimplemented',
  '503': 'unavailable',
  '504': 'deadline_exceeded',
} as const;

// canonicalCodesGrpcMap maps some GRPC codes to Sentry's span statuses. See description in grpc documentation.
const canonicalCodesGrpcMap: Record<string, SentryStatus> = {
  '1': 'cancelled',
  '2': 'unknown_error',
  '3': 'invalid_argument',
  '4': 'deadline_exceeded',
  '5': 'not_found',
  '6': 'already_exists',
  '7': 'permission_denied',
  '8': 'resource_exhausted',
  '9': 'failed_precondition',
  '10': 'aborted',
  '11': 'out_of_range',
  '12': 'unimplemented',
  '13': 'internal_error',
  '14': 'unavailable',
  '15': 'data_loss',
  '16': 'unauthenticated',
} as const;

/**
 * Get a Sentry span status from an otel span.
 *
 * @param otelSpan An otel span to generate a sentry status for.
 * @returns The Sentry span status
 */
export function mapOtelStatus(otelSpan: OtelSpan): SentryStatus {
  const { status, attributes } = otelSpan;

  const statusCode = status.code;

  if (statusCode < 0 || statusCode > 2) {
    return 'unknown_error';
  }

  if (statusCode === 0 || statusCode === 1) {
    return 'ok';
  }

  const httpCode = attributes[SemanticAttributes.HTTP_STATUS_CODE];
  const grpcCode = attributes[SemanticAttributes.RPC_GRPC_STATUS_CODE];

  const code = typeof httpCode === 'string' ? httpCode : typeof httpCode === 'number' ? httpCode.toString() : undefined;
  if (code) {
    const sentryStatus = canonicalCodesHTTPMap[code];
    if (sentryStatus) {
      return sentryStatus;
    }
  }

  if (typeof grpcCode === 'string') {
    const sentryStatus = canonicalCodesGrpcMap[grpcCode];
    if (sentryStatus) {
      return sentryStatus;
    }
  }

  return 'unknown_error';
}
