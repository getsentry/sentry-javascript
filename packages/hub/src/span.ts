import { Span as SpanInterface } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

export const TRACEPARENT_REGEXP = /^[ \t]*([0-9a-f]{32})?-?([0-9a-f]{16})?-?([01])?[ \t]*$/;

/**
 * Span containg all data about a span
 */
export class Span implements SpanInterface {
  public constructor(
    private readonly _traceId: string = uuid4(),
    private readonly _spanId: string = uuid4().substring(16),
    private _sampled?: boolean,
    private _parent?: Span,
  ) {}

  /**
   * Setter for parent
   */
  public setParent(parent: Span | undefined): this {
    this._parent = parent;
    return this;
  }

  /**
   * Setter for sampled
   */
  public setSampled(sampled: boolean | undefined): this {
    this._sampled = sampled;
    return this;
  }

  /**
   * Continues a trace
   * @param traceparent Traceparent string
   */
  public static fromTraceparent(traceparent: string): Span | undefined {
    const matches = traceparent.match(TRACEPARENT_REGEXP);
    if (matches) {
      let sampled;
      if (matches[3] === '1') {
        sampled = true;
      } else if (matches[3] === '0') {
        sampled = false;
      }
      const parent = new Span(matches[1], matches[2], sampled);
      return new Span(matches[1], undefined, sampled, parent);
    }
    return undefined;
  }

  /**
   * @inheritDoc
   */
  public toTraceparent(): string {
    let sampled = '';
    if (this._sampled === true) {
      sampled = '-1';
    } else if (this._sampled === false) {
      sampled = '-0';
    }

    return `${this._traceId}-${this._spanId}${sampled}`;
  }

  /**
   * @inheritDoc
   */
  public toJSON(): object {
    return {
      parent: (this._parent && this._parent.toJSON()) || undefined,
      sampled: this._sampled,
      span_id: this._spanId,
      trace_id: this._traceId,
    };
  }
}
