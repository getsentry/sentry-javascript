/** Span holding trace_id, span_id */
export interface Span {
  /** Return a traceparent compatible header string */
  toTraceparent(): string;
  /** Convert the object to JSON */
  toJSON(): object;
}
