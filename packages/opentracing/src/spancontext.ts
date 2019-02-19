import { uuid4 } from '@sentry/utils/misc';
/**
 * JSDoc
 */
export class SpanContext {
  public constructor(
    private readonly traceId: string,
    private readonly spanId: string = uuid4(), // private readonly parentId: string,
  ) {}

  /**
   * Returns debug version of the span.
   */
  public toString(): string {
    return `TraceId: ${this.traceId} SpanId: ${this.spanId}`;
  }
}
