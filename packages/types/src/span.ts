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
  setStatus(status: string): this;

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
  status?: string;
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
