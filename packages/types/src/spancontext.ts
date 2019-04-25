/** JSDoc */
export interface SpanContext {
  traceId: string;
  spanId: string;
  recorded: boolean;
  transaction?: string;
  parent?: SpanContext;
  /** JSDoc */
  toTraceparent(): string;
  /** JSDoc */
  toJSON(): object;
}
