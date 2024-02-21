import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { SpanStatusType } from '@sentry/core';

import { mapStatus } from '../../src/utils/mapStatus';
import { createSpan } from '../helpers/createSpan';

describe('mapStatus', () => {
  const statusTestTable: [number, undefined | number | string, undefined | string, SpanStatusType][] = [
    [-1, undefined, undefined, 'unknown_error'],
    [3, undefined, undefined, 'unknown_error'],
    [0, undefined, undefined, 'ok'],
    [1, undefined, undefined, 'ok'],
    [2, undefined, undefined, 'unknown_error'],

    // http codes
    [2, 400, undefined, 'failed_precondition'],
    [2, 401, undefined, 'unauthenticated'],
    [2, 403, undefined, 'permission_denied'],
    [2, 404, undefined, 'not_found'],
    [2, 409, undefined, 'aborted'],
    [2, 429, undefined, 'resource_exhausted'],
    [2, 499, undefined, 'cancelled'],
    [2, 500, undefined, 'internal_error'],
    [2, 501, undefined, 'unimplemented'],
    [2, 503, undefined, 'unavailable'],
    [2, 504, undefined, 'deadline_exceeded'],
    [2, 999, undefined, 'unknown_error'],

    [2, '400', undefined, 'failed_precondition'],
    [2, '401', undefined, 'unauthenticated'],
    [2, '403', undefined, 'permission_denied'],
    [2, '404', undefined, 'not_found'],
    [2, '409', undefined, 'aborted'],
    [2, '429', undefined, 'resource_exhausted'],
    [2, '499', undefined, 'cancelled'],
    [2, '500', undefined, 'internal_error'],
    [2, '501', undefined, 'unimplemented'],
    [2, '503', undefined, 'unavailable'],
    [2, '504', undefined, 'deadline_exceeded'],
    [2, '999', undefined, 'unknown_error'],

    // grpc codes
    [2, undefined, '1', 'cancelled'],
    [2, undefined, '2', 'unknown_error'],
    [2, undefined, '3', 'invalid_argument'],
    [2, undefined, '4', 'deadline_exceeded'],
    [2, undefined, '5', 'not_found'],
    [2, undefined, '6', 'already_exists'],
    [2, undefined, '7', 'permission_denied'],
    [2, undefined, '8', 'resource_exhausted'],
    [2, undefined, '9', 'failed_precondition'],
    [2, undefined, '10', 'aborted'],
    [2, undefined, '11', 'out_of_range'],
    [2, undefined, '12', 'unimplemented'],
    [2, undefined, '13', 'internal_error'],
    [2, undefined, '14', 'unavailable'],
    [2, undefined, '15', 'data_loss'],
    [2, undefined, '16', 'unauthenticated'],
    [2, undefined, '999', 'unknown_error'],

    // http takes precedence over grpc
    [2, '400', '2', 'failed_precondition'],
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
