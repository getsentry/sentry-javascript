/** JSDoc */
export interface SpanContext {
  traceId: string;
  spanId: string;
  recorded: boolean;
  parent?: SpanContext;
  /** JSDoc */
  toTraceparent(): string;
}
