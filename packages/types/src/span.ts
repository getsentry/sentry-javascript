/** Span holding trace_id, span_id */
export interface Span {
  /** Sets the finish timestamp on the current span and sends it if it was a transaction */
  finish(useLastSpanTimestamp?: boolean): string | undefined;
  /** Return a traceparent compatible header string */
  toTraceparent(): string;
  /** Convert the object to JSON for w. spans array info only */
  getTraceContext(): object;
  /** Convert the object to JSON */
  toJSON(): object;

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
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   */
  setFailure(): this;

  /**
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   */
  setSuccess(): this;

  /**
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   */
  isSuccess(): boolean;
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
  status?: boolean;
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
