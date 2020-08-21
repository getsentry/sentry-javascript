/** Interface holding all properties that can be set on a Span on creation. */
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
   * See: {@sentry/apm SpanStatus} for possible values
   */
  status?: string;

  /**
   * Parent Span ID
   */
  parentSpanId?: string;

  /**
   * Was this span chosen to be sent as part of the sample?
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
   * Tags of the Span.
   */
  tags?: { [key: string]: string };

  /**
   * Data of the Span.
   */
  data?: { [key: string]: any };

  /**
   * Timestamp in seconds (epoch time) indicating when the span started.
   */
  startTimestamp?: number;

  /**
   * Timestamp in seconds (epoch time) indicating when the span ended.
   */
  endTimestamp?: number;
}

/** Span holding trace_id, span_id */
export interface Span extends SpanContext {
  /**
   * @inheritDoc
   */
  spanId: string;

  /**
   * @inheritDoc
   */
  traceId: string;

  /**
   * @inheritDoc
   */
  startTimestamp: number;

  /**
   * @inheritDoc
   */
  tags: { [key: string]: string };

  /**
   * @inheritDoc
   */
  data: { [key: string]: any };

  /**
   * Sets the finish timestamp on the current span.
   * @param endTimestamp Takes an endTimestamp if the end should not be the time when you call this function.
   */
  finish(endTimestamp?: number): void;

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
   * See: {@sentry/apm SpanStatus} for possible values
   * @param status http code used to set the status
   */
  setStatus(status: string): this;

  /**
   * Sets the status attribute on the current span based on the http code
   * @param httpStatus http code used to set the status
   */
  setHttpStatus(httpStatus: number): this;

  /**
   * Use {@link startChild}
   * @deprecated
   */
  child(
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>,
  ): Span;

  /**
   * Creates a new `Span` while setting the current `Span.id` as `parentSpanId`.
   * Also the `sampled` decision will be inherited.
   */
  startChild(
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>,
  ): Span;

  /**
   * Determines whether span was successful (HTTP200)
   */
  isSuccess(): boolean;

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
  };
}
