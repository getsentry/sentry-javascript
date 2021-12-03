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

// eslint-disable-next-line @typescript-eslint/no-namespace, import/export
export namespace SpanStatus {
  /**
   * Converts a HTTP status code into a {@link SpanStatus}.
   *
   * @param httpStatus The HTTP response status code.
   * @returns The span status or {@link SpanStatus.UnknownError}.
   */
  export function fromHttpCode(httpStatus: number): SpanStatus {
    if (httpStatus < 400 && httpStatus >= 100) {
      return SpanStatus.Ok;
    }

    if (httpStatus >= 400 && httpStatus < 500) {
      switch (httpStatus) {
        case 401:
          return SpanStatus.Unauthenticated;
        case 403:
          return SpanStatus.PermissionDenied;
        case 404:
          return SpanStatus.NotFound;
        case 409:
          return SpanStatus.AlreadyExists;
        case 413:
          return SpanStatus.FailedPrecondition;
        case 429:
          return SpanStatus.ResourceExhausted;
        default:
          return SpanStatus.InvalidArgument;
      }
    }

    if (httpStatus >= 500 && httpStatus < 600) {
      switch (httpStatus) {
        case 501:
          return SpanStatus.Unimplemented;
        case 503:
          return SpanStatus.Unavailable;
        case 504:
          return SpanStatus.DeadlineExceeded;
        default:
          return SpanStatus.InternalError;
      }
    }

    return SpanStatus.UnknownError;
  }
}
