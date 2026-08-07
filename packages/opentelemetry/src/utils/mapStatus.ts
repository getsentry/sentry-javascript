import { HTTP_RESPONSE_STATUS_CODE, HTTP_STATUS_CODE, RPC_GRPC_STATUS_CODE } from '@sentry/conventions/attributes';
import type { RawAttributes, SpanStatus } from '@sentry/core';
import { getSpanStatusFromHttpCode, SPAN_STATUS_ERROR } from '@sentry/core';

// canonicalCodesGrpcMap maps some GRPC codes to Sentry's span statuses. See description in grpc documentation.
const canonicalGrpcErrorCodesMap: Record<string, SpanStatus['message']> = {
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

export function inferStatusFromAttributes(attributes: RawAttributes<Record<string, unknown>>): SpanStatus | undefined {
  // If the span status is UNSET, we try to infer it from HTTP or GRPC status codes.

  // eslint-disable-next-line typescript/no-deprecated
  const httpCodeAttribute = attributes[HTTP_RESPONSE_STATUS_CODE] || attributes[HTTP_STATUS_CODE];
  // eslint-disable-next-line typescript/no-deprecated
  const grpcCodeAttribute = attributes[RPC_GRPC_STATUS_CODE];

  const numberHttpCode =
    typeof httpCodeAttribute === 'number'
      ? httpCodeAttribute
      : typeof httpCodeAttribute === 'string'
        ? parseInt(httpCodeAttribute)
        : undefined;

  if (typeof numberHttpCode === 'number') {
    return getSpanStatusFromHttpCode(numberHttpCode);
  }

  if (typeof grpcCodeAttribute === 'string') {
    return { code: SPAN_STATUS_ERROR, message: canonicalGrpcErrorCodesMap[grpcCodeAttribute] || 'unknown_error' };
  }

  return undefined;
}
