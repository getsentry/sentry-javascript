/** Span holding trace_id, span_id */
export interface Span {
  /** Return a traceparent compatible header string */
  toTraceparent(): string;
  /** Convert the object to JSON for w. spans array info only */
  getTraceContext(): object;
  /** Convert the object to JSON */
  toJSON(): object;
}

/** JSDoc */
export interface SpanProps {
  description?: string;
  op?: string;
  parentSpanId?: string;
  sampled?: boolean;
  spanId?: string;
  traceId?: string;
  transaction?: string;
  tags?: { [key: string]: string };
  data?: { [key: string]: any };
}
