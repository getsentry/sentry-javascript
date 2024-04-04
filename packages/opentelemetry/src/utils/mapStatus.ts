import { SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { SPAN_STATUS_ERROR, SPAN_STATUS_OK, getSpanStatusFromHttpCode } from '@sentry/core';
import type { SpanStatus } from '@sentry/types';

import type { AbstractSpan } from '../types';
import { spanHasAttributes, spanHasStatus } from './spanTypes';

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

const isStatusErrorMessageValid = (message: string): boolean => {
  return Object.values(canonicalGrpcErrorCodesMap).includes(message as SpanStatus['message']);
};

/**
 * Get a Sentry span status from an otel span.
 */
export function mapStatus(span: AbstractSpan): SpanStatus {
  const attributes = spanHasAttributes(span) ? span.attributes : {};
  const status = spanHasStatus(span) ? span.status : undefined;

  if (status) {
    // Since span status OK is not set by default, we give it priority: https://opentelemetry.io/docs/concepts/signals/traces/#span-status
    if (status.code === SpanStatusCode.OK) {
      return { code: SPAN_STATUS_OK };
      // If the span is already marked as erroneous we return that exact status
    } else if (status.code === SpanStatusCode.ERROR) {
      if (typeof status.message === 'undefined' || isStatusErrorMessageValid(status.message)) {
        return { code: SPAN_STATUS_ERROR, message: status.message };
      } else {
        return { code: SPAN_STATUS_ERROR, message: 'unknown_error' };
      }
    }
  }

  // If the span status is UNSET, we try to infer it from HTTP or GRPC status codes.

  const httpCodeAttribute = attributes[SemanticAttributes.HTTP_STATUS_CODE];
  const grpcCodeAttribute = attributes[SemanticAttributes.RPC_GRPC_STATUS_CODE];

  const numberHttpCode =
    typeof httpCodeAttribute === 'number'
      ? httpCodeAttribute
      : typeof httpCodeAttribute === 'string'
        ? parseInt(httpCodeAttribute)
        : undefined;

  if (numberHttpCode) {
    return getSpanStatusFromHttpCode(numberHttpCode);
  }

  if (typeof grpcCodeAttribute === 'string') {
    return { code: SPAN_STATUS_ERROR, message: canonicalGrpcErrorCodesMap[grpcCodeAttribute] || 'unknown_error' };
  }

  // We default to setting the spans status to ok.
  if (status && status.code === SpanStatusCode.UNSET) {
    return { code: SPAN_STATUS_OK };
  } else {
    return { code: SPAN_STATUS_ERROR, message: 'unknown_error' };
  }
}
