/** Span holding trace_id, span_id */
export interface Span {
  /** Sets the finish timestamp on the current span and sends it if it was a transaction */
  finish(useLastSpanTimestamp?: boolean): string | undefined;
  /** Return a traceparent compatible header string */
  toTraceparent(): string;
  /** Convert the object to JSON for w. spans array info only */
  getTraceContext(): {
    data?: { [key: string]: any };
    description?: string;
    op?: string;
    parent_span_id?: string;
    span_id: string;
    status?: string;
    tags?: { [key: string]: string };
    trace_id: string;
  };
  /** Convert the object to JSON */
  toJSON(): {
    data?: { [key: string]: any };
    description?: string;
    op?: string;
    parent_span_id?: string;
    sampled?: boolean;
    span_id: string;
    start_timestamp: number;
    tags?: { [key: string]: string };
    timestamp?: number;
    trace_id: string;
    transaction?: string;
  };

  /**
   * Sets the tag attribute on the current span
   * @param key Tag key
   * @param value Tag value
   */
  setTag(key: string, value: string): this;

  /**
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   */
  setData(key: string, value: any): this;

  /**
   * Sets the status attribute on the current span
   * @param status http code used to set the status
   */
  setStatus(status: SpanStatus): this;

  /**
   * Sets the status attribute on the current span based on the http code
   * @param httpStatus http code used to set the status
   */
  setHttpStatus(httpStatus: number): this;

  /**
   * Creates a new `Span` while setting the current `Span.id` as `parentSpanId`.
   * Also the `sampled` decision will be inherited.
   */
  child(
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>,
  ): Span;

  /**
   * Determines whether span was successful (HTTP200)
   */
  isSuccess(): boolean;

  /**
   * Determines if the span is transaction (root)
   */
  isRootSpan(): boolean;
}

/** Interface holder all properties that can be set on a Span on creation. */
export interface SpanContext {
  /**
   * Description of the Span.
   */
  description?: string;
  /**
   * Operation of the Span.
   */
  op?: string;
  /**
   * Completion status of the Span.
   */
  status?: SpanStatus;
  /**
   * Parent Span ID
   */
  parentSpanId?: string;
  /**
   * Has the sampling decision been made?
   */
  sampled?: boolean;
  /**
   * Span ID
   */
  spanId?: string;
  /**
   * Trace ID
   */
  traceId?: string;
  /**
   * Transaction of the Span.
   */
  transaction?: string;
  /**
   * Tags of the Span.
   */
  tags?: { [key: string]: string };

  /**
   * Data of the Span.
   */
  data?: { [key: string]: any };
}

/** The status of an Span. */
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

// tslint:disable:no-unnecessary-qualifier no-namespace
export namespace SpanStatus {
  /**
   * Converts a HTTP status code into a {@link SpanStatus}.
   *
   * @param httpStatus The HTTP response status code.
   * @returns The span status or {@link SpanStatus.UnknownError}.
   */
  // tslint:disable-next-line:completed-docs
  export function fromHttpCode(httpStatus: number): SpanStatus {
    if (httpStatus < 400) {
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
