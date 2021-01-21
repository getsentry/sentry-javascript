/**
 * Describes the status of the Span/Transaction.
 */
// eslint-disable-next-line import/export
export enum SpanStatus {
  /**
   * Not an error, returned on success
   */
  Ok = 'ok',

  /**
   * The operation was cancelled, typically by the caller
   */
  Cancelled = 'cancelled',

  /** An unknown error raised by APIs that don't return enough error information. */
  Unknown = 'unknown',

  /**
   * An unknown error raised by APIs that don't return enough error information.
   */
  UnknownError = 'unknown_error',

  /**
   * The client specified an invalid argument
   */
  InvalidArgument = 'invalid_argument',

  /**
   * The deadline expired before the operation could succeed.
   */
  DeadlineExceeded = 'deadline_exceeded',

  /**
   * Content was not found or request was denied for an entire class of users.
   */
  NotFound = 'not_found',

  /**
   * The entity attempted to be created already exists
   */
  AlreadyExists = 'already_exists',

  /**
   * The caller doesn't have permission to execute the specified operation.
   */
  PermissionDenied = 'permission_denied',

  /**
   * The resource has been exhausted e.g. per-user quota exhausted,
   * file system out of space.
   */
  ResourceExhausted = 'resource_exhausted',

  /**
   * The client shouldn't retry until the system state has been explicitly handled.
   */
  FailedPrecondition = 'failed_precondition',

  /**
   * The operation was aborted.
   */
  Aborted = 'aborted',

  /**
   * The operation was attempted past the valid range e.g.
   * seeking past the end of a file.
   */
  OutOfRange = 'out_of_range',

  /**
   * The operation is not implemented or is not supported/enabled for this operation.
   */
  Unimplemented = 'unimplemented',

  /**
   * Some invariants expected by the underlying system have been broken.
   * This code is reserved for serious errors
   */
  InternalError = 'internal_error',

  /**
   * The service is currently available e.g. as a transient condition.
   */
  Unavailable = 'unavailable',

  /**
   * Unrecoverable data loss or corruption.
   */
  DataLoss = 'data_loss',

  /**
   * The requester doesn't have valid authentication credentials for the operation.
   */
  Unauthenticated = 'unauthenticated',
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
    if (httpStatus < 400) {
      return SpanStatus.Ok;
    }

    if (httpStatus >= 400 && httpStatus < 500) {
      switch (httpStatus) {
        case 499:
          return SpanStatus.Cancelled;
        case 400:
          return SpanStatus.InvalidArgument;
        // Could be as well
        // return SpanStatus.FailedPrecondition;
        // return SpanStatus.OutOfRange;
        case 404:
          return SpanStatus.NotFound;
        case 409:
          return SpanStatus.AlreadyExists;
        // Could be as well
        // return SpanStatus.Aborted;
        case 403:
          return SpanStatus.PermissionDenied;
        case 429:
          return SpanStatus.ResourceExhausted;
        case 401:
          return SpanStatus.Unauthenticated;
        default:
          return SpanStatus.InvalidArgument;
      }
    }

    if (httpStatus >= 500 && httpStatus < 600) {
      switch (httpStatus) {
        case 500:
          return SpanStatus.InternalError;
        // Could be as well
        // return SpanStatus.UnknownError;
        // return SpanStatus.DataLoss;
        case 504:
          return SpanStatus.DeadlineExceeded;
        case 501:
          return SpanStatus.Unimplemented;
        case 503:
          return SpanStatus.Unavailable;
        default:
          return SpanStatus.InternalError;
      }
    }

    return SpanStatus.UnknownError;
  }
}
