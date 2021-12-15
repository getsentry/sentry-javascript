/** The status of an Span. */
// eslint-disable-next-line import/export
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
export function spanStatusfromHttpCode(httpStatus: number): SpanStatusType {
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
