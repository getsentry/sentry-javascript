import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { SPAN_STATUS_ERROR, SPAN_STATUS_OK } from '@sentry/core';
import type { SpanStatus } from '@sentry/types';

import { mapStatus } from '../../src/utils/mapStatus';
import { createSpan } from '../helpers/createSpan';

describe('mapStatus', () => {
  const statusTestTable: [number, undefined | number | string, undefined | string, SpanStatus][] = [
    [-1, undefined, undefined, { code: SPAN_STATUS_ERROR, message: 'unknown_error' }],
    [3, undefined, undefined, { code: SPAN_STATUS_ERROR, message: 'unknown_error' }],
    [0, undefined, undefined, { code: SPAN_STATUS_OK }],
    [1, undefined, undefined, { code: SPAN_STATUS_OK }],
    [2, undefined, undefined, { code: SPAN_STATUS_ERROR, message: 'unknown_error' }],

    // http codes
    [2, 400, undefined, { code: SPAN_STATUS_ERROR, message: 'failed_precondition' }],
    [2, 401, undefined, { code: SPAN_STATUS_ERROR, message: 'unauthenticated' }],
    [2, 403, undefined, { code: SPAN_STATUS_ERROR, message: 'permission_denied' }],
    [2, 404, undefined, { code: SPAN_STATUS_ERROR, message: 'not_found' }],
    [2, 409, undefined, { code: SPAN_STATUS_ERROR, message: 'aborted' }],
    [2, 429, undefined, { code: SPAN_STATUS_ERROR, message: 'resource_exhausted' }],
    [2, 499, undefined, { code: SPAN_STATUS_ERROR, message: 'cancelled' }],
    [2, 500, undefined, { code: SPAN_STATUS_ERROR, message: 'internal_error' }],
    [2, 501, undefined, { code: SPAN_STATUS_ERROR, message: 'unimplemented' }],
    [2, 503, undefined, { code: SPAN_STATUS_ERROR, message: 'unavailable' }],
    [2, 504, undefined, { code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' }],
    [2, 999, undefined, { code: SPAN_STATUS_ERROR, message: 'unknown_error' }],

    [2, '400', undefined, { code: SPAN_STATUS_ERROR, message: 'failed_precondition' }],
    [2, '401', undefined, { code: SPAN_STATUS_ERROR, message: 'unauthenticated' }],
    [2, '403', undefined, { code: SPAN_STATUS_ERROR, message: 'permission_denied' }],
    [2, '404', undefined, { code: SPAN_STATUS_ERROR, message: 'not_found' }],
    [2, '409', undefined, { code: SPAN_STATUS_ERROR, message: 'aborted' }],
    [2, '429', undefined, { code: SPAN_STATUS_ERROR, message: 'resource_exhausted' }],
    [2, '499', undefined, { code: SPAN_STATUS_ERROR, message: 'cancelled' }],
    [2, '500', undefined, { code: SPAN_STATUS_ERROR, message: 'internal_error' }],
    [2, '501', undefined, { code: SPAN_STATUS_ERROR, message: 'unimplemented' }],
    [2, '503', undefined, { code: SPAN_STATUS_ERROR, message: 'unavailable' }],
    [2, '504', undefined, { code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' }],
    [2, '999', undefined, { code: SPAN_STATUS_ERROR, message: 'unknown_error' }],

    // grpc codes
    [2, undefined, '1', { code: SPAN_STATUS_ERROR, message: 'cancelled' }],
    [2, undefined, '2', { code: SPAN_STATUS_ERROR, message: 'unknown_error' }],
    [2, undefined, '3', { code: SPAN_STATUS_ERROR, message: 'invalid_argument' }],
    [2, undefined, '4', { code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' }],
    [2, undefined, '5', { code: SPAN_STATUS_ERROR, message: 'not_found' }],
    [2, undefined, '6', { code: SPAN_STATUS_ERROR, message: 'already_exists' }],
    [2, undefined, '7', { code: SPAN_STATUS_ERROR, message: 'permission_denied' }],
    [2, undefined, '8', { code: SPAN_STATUS_ERROR, message: 'resource_exhausted' }],
    [2, undefined, '9', { code: SPAN_STATUS_ERROR, message: 'failed_precondition' }],
    [2, undefined, '10', { code: SPAN_STATUS_ERROR, message: 'aborted' }],
    [2, undefined, '11', { code: SPAN_STATUS_ERROR, message: 'out_of_range' }],
    [2, undefined, '12', { code: SPAN_STATUS_ERROR, message: 'unimplemented' }],
    [2, undefined, '13', { code: SPAN_STATUS_ERROR, message: 'internal_error' }],
    [2, undefined, '14', { code: SPAN_STATUS_ERROR, message: 'unavailable' }],
    [2, undefined, '15', { code: SPAN_STATUS_ERROR, message: 'data_loss' }],
    [2, undefined, '16', { code: SPAN_STATUS_ERROR, message: 'unauthenticated' }],
    [2, undefined, '999', { code: SPAN_STATUS_ERROR, message: 'unknown_error' }],

    // http takes precedence over grpc
    [2, '400', '2', { code: SPAN_STATUS_ERROR, message: 'failed_precondition' }],
  ];

  it.each(statusTestTable)(
    'works with otelStatus=%i, httpCode=%s, grpcCode=%s',
    (otelStatus, httpCode, grpcCode, expected) => {
      const span = createSpan();
      span.setStatus({ code: otelStatus });

      if (httpCode) {
        span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, httpCode);
      }

      if (grpcCode) {
        span.setAttribute(SemanticAttributes.RPC_GRPC_STATUS_CODE, grpcCode);
      }

      const actual = mapStatus(span);
      expect(actual).toEqual(expected);
    },
  );
});
