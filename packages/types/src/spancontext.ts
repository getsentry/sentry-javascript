/** SpanContext holding trace_id, span_id */
export interface SpanContext {
  /** Return a traceparent compatible header string */
  toTraceparent(): string;
  /** Convert the object to JSON */
  toJSON(): object;
}
