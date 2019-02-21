import { uuid4 } from '@sentry/utils/misc';
/**
 * JSDoc
 */
export class SpanContext {
  public constructor(
    public readonly traceId?: string,
    public readonly spanId: string = uuid4().substring(16), // private readonly parentId: string,
  ) {}

  /**
   * Returns debug version of the span.
   */
  public toString(): string {
    return `${(this.traceId && `trace-id:${this.traceId};`) || ''}span-id:${this.spanId}`;
  }
}
