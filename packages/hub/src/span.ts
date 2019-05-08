import { Span as SpanInterface } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

export const TRACEPARENT_REGEXP = /([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})/;

/**
 * Span containg all data about a span
 */
export class Span implements SpanInterface {
  public constructor(
    private readonly _traceId: string = uuid4(),
    private readonly _spanId: string = uuid4().substring(16),
    private readonly _recorded: boolean = false,
    private readonly _parent?: Span,
  ) {}

  /**
   * Continues a trace
   * @param traceparent Traceparent string
   */
  public static fromTraceparent(traceparent: string): Span | undefined {
    const matches = traceparent.match(TRACEPARENT_REGEXP);
    if (matches) {
      const parent = new Span(matches[2], matches[3], matches[4] === '01' ? true : false);
      return new Span(matches[2], undefined, undefined, parent);
    }
    return undefined;
  }

  /**
   * @inheritDoc
   */
  public toTraceparent(): string {
    return `00-${this._traceId}-${this._spanId}-${this._recorded ? '01' : '00'}`;
  }

  /**
   * @inheritDoc
   */
  public toJSON(): object {
    return {
      parent: (this._parent && this._parent.toJSON()) || undefined,
      span_id: this._spanId,
      trace_id: this._traceId,
    };
  }
}
