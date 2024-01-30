import type { Span } from '@sentry/types';

/** The status of an Span.
 *
 * @deprecated Use string literals - if you require type casting, cast to SpanStatusType type
 */
export enum SpanStatus {
  /** The operation completed successfully. */
  Ok = 'ok',
  /** Deadline expired before operation could complete. */
  DeadlineExceeded = 'deadline_exceeded',
  /** 401 Unauthorized (actually does mean unauthenticated according to RFC 7235) */
  Unauthenticated = 'unauthenticated',
  /** 403 Forbidden */
  PermissionDenied = 'permission_denied',
  /** 404 Not Found. Some requested entity (file or directory) was not found. */
  NotFound = 'not_found',
  /** 429 Too Many Requests */
  ResourceExhausted = 'resource_exhausted',
  /** Client specified an invalid argument. 4xx. */
  InvalidArgument = 'invalid_argument',
  /** 501 Not Implemented */
  Unimplemented = 'unimplemented',
  /** 503 Service Unavailable */
  Unavailable = 'unavailable',
  /** Other/generic 5xx. */
  InternalError = 'internal_error',
  /** Unknown. Any non-standard HTTP status code. */
  UnknownError = 'unknown_error',
  /** The operation was cancelled (typically by the user). */
  Cancelled = 'cancelled',
  /** Already exists (409) */
  AlreadyExists = 'already_exists',
  /** Operation was rejected because the system is not in a state required for the operation's */
  FailedPrecondition = 'failed_precondition',
  /** The operation was aborted, typically due to a concurrency issue. */
  Aborted = 'aborted',
  /** Operation was attempted past the valid range. */
  OutOfRange = 'out_of_range',
  /** Unrecoverable data loss or corruption */
  DataLoss = 'data_loss',
}

export type SpanStatusType =
  /** The operation completed successfully. */
  | 'ok'
  /** Deadline expired before operation could complete. */
  | 'deadline_exceeded'
  /** 401 Unauthorized (actually does mean unauthenticated according to RFC 7235) */
  | 'unauthenticated'
  /** 403 Forbidden */
  | 'permission_denied'
  /** 404 Not Found. Some requested entity (file or directory) was not found. */
  | 'not_found'
  /** 429 Too Many Requests */
  | 'resource_exhausted'
  /** Client specified an invalid argument. 4xx. */
  | 'invalid_argument'
  /** 501 Not Implemented */
  | 'unimplemented'
  /** 503 Service Unavailable */
  | 'unavailable'
  /** Other/generic 5xx. */
  | 'internal_error'
  /** Unknown. Any non-standard HTTP status code. */
  | 'unknown_error'
  /** The operation was cancelled (typically by the user). */
  | 'cancelled'
  /** Already exists (409) */
  | 'already_exists'
  /** Operation was rejected because the system is not in a state required for the operation's */
  | 'failed_precondition'
  /** The operation was aborted, typically due to a concurrency issue. */
  | 'aborted'
  /** Operation was attempted past the valid range. */
  | 'out_of_range'
  /** Unrecoverable data loss or corruption */
  | 'data_loss';

/**
 * Converts a HTTP status code into a {@link SpanStatusType}.
 *
 * @param httpStatus The HTTP response status code.
 * @returns The span status or unknown_error.
 */
export function getSpanStatusFromHttpCode(httpStatus: number): SpanStatusType {
  if (httpStatus < 400 && httpStatus >= 100) {
    return 'ok';
  }

  if (httpStatus >= 400 && httpStatus < 500) {
    switch (httpStatus) {
      case 401:
        return 'unauthenticated';
      case 403:
        return 'permission_denied';
      case 404:
        return 'not_found';
      case 409:
        return 'already_exists';
      case 413:
        return 'failed_precondition';
      case 429:
        return 'resource_exhausted';
      default:
        return 'invalid_argument';
    }
  }

  if (httpStatus >= 500 && httpStatus < 600) {
    switch (httpStatus) {
      case 501:
        return 'unimplemented';
      case 503:
        return 'unavailable';
      case 504:
        return 'deadline_exceeded';
      default:
        return 'internal_error';
    }
  }

  return 'unknown_error';
}

/**
 * Converts a HTTP status code into a {@link SpanStatusType}.
 *
 * @deprecated Use {@link spanStatusFromHttpCode} instead.
 * This export will be removed in v8 as the signature contains a typo.
 *
 * @param httpStatus The HTTP response status code.
 * @returns The span status or unknown_error.
 */
export const spanStatusfromHttpCode = getSpanStatusFromHttpCode;

/**
 * Sets the Http status attributes on the current span based on the http code.
 * Additionally, the span's status is updated, depending on the http code.
 */
export function setHttpStatus(span: Span, httpStatus: number): void {
  // TODO (v8): Remove these calls
  // Relay does not require us to send the status code as a tag
  // For now, just because users might expect it to land as a tag we keep sending it.
  // Same with data.
  // In v8, we replace both, simply with
  // span.setAttribute('http.response.status_code', httpStatus);

  // eslint-disable-next-line deprecation/deprecation
  span.setTag('http.status_code', String(httpStatus));
  // eslint-disable-next-line deprecation/deprecation
  span.setData('http.response.status_code', httpStatus);

  const spanStatus = getSpanStatusFromHttpCode(httpStatus);
  if (spanStatus !== 'unknown_error') {
    span.setStatus(spanStatus);
  }
}
