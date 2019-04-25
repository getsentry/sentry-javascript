import { SpanContext as SpanContextInterface } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

export const TRACEPARENT_REGEX = /([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})/;

/**
 * SpanContext containg all data about a span
 */
export class SpanContext implements SpanContextInterface {
  public constructor(
    public traceId: string = uuid4(),
    public spanId: string = uuid4().substring(16),
    public recorded: boolean = false,
    public transaction?: string,
    public parent?: SpanContext,
  ) {}

  /**
   * Continues a trace
   * @param traceparent Traceparent string
   */
  public static fromTraceparent(traceparent: string): SpanContext | undefined {
    const matches = traceparent.match(TRACEPARENT_REGEX);
    if (matches) {
      const parent = new SpanContext(matches[2], matches[3], matches[4] === '01' ? true : false);
      return new SpanContext(matches[2], undefined, undefined, undefined, parent);
    }
    return undefined;
  }

  /**
   * @inheritDoc
   */
  public toTraceparent(): string {
    return `00-${this.traceId}-${this.spanId}-${this.recorded ? '01' : '00'}`;
  }

  /**
   * @inheritDoc
   */
  public toJSON(): object {
    return {
      span_id: this.spanId,
      trace_id: this.traceId,
      transaction: this.transaction,
    };
  }
}
