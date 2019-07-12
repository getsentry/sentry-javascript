import { Span as SpanInterface, SpanProps } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

export const TRACEPARENT_REGEXP = /^[ \t]*([0-9a-f]{32})?-?([0-9a-f]{16})?-?([01])?[ \t]*$/;

/**
 * Span contains all data about a span
 */
export class Span implements SpanInterface, SpanProps {
  /**
   * Trace ID
   */
  private readonly _traceId: string = uuid4();

  /**
   * Span ID
   */
  private readonly _spanId: string = uuid4().substring(16);

  /**
   * Parent Span ID
   */
  private readonly _parentSpanId?: string;

  /**
   * Has the sampling decision been made?
   */
  public readonly sampled?: string;

  /**
   * Timestamp when the span was created.
   */
  public readonly startTimestamp: number = new Date().getTime();

  /**
   * Finish timestamp of the span.
   */
  public timestamp?: number;

  /**
   * Transaction of the Span.
   */
  public transaction?: string;

  /**
   * Operation of the Span.
   */
  public op?: string;

  /**
   * Description of the Span.
   */
  public description?: string;

  /**
   * Tags of the Span.
   */
  public tags?: { [key: string]: string };

  /**
   * Data of the Span.
   */
  public data?: { [key: string]: any };

  /**
   * List of spans that were finalized
   */
  public finishedSpans: Span[] = [];

  public constructor(spanProps?: SpanProps) {
    if (!spanProps) {
      return this;
    }

    if (spanProps.traceId) {
      this._traceId = spanProps.traceId;
    }
    if (spanProps.spanId) {
      this._spanId = spanProps.spanId;
    }
    if (spanProps.parentSpanId) {
      this._parentSpanId = spanProps.parentSpanId;
    }
    if (spanProps.sampled) {
      this.sampled = spanProps.sampled;
    }
    if (spanProps.transaction) {
      this.transaction = spanProps.transaction;
    }
    if (spanProps.op) {
      this.op = spanProps.op;
    }
    if (spanProps.description) {
      this.description = spanProps.description;
    }
    if (spanProps.data) {
      this.data = spanProps.data;
    }
    if (spanProps.tags) {
      this.tags = spanProps.tags;
    }
  }

  /** JSDoc */
  public newSpan(spanProps?: Pick<SpanProps, Exclude<keyof SpanProps, 'spanId'>>): Span {
    const span = new Span({
      ...spanProps,
      parentSpanId: this._spanId,
      sampled: this.sampled,
      traceId: this._traceId,
    });

    span.finishedSpans = this.finishedSpans;

    return span;
  }

  /**
   * Continues a trace
   * @param traceparent Traceparent string
   */
  public static fromTraceparent(
    traceparent: string,
    spanProps?: Pick<SpanProps, Exclude<keyof SpanProps, 'spanId' | 'sampled' | 'traceid'>>,
  ): Span | undefined {
    const matches = traceparent.match(TRACEPARENT_REGEXP);
    if (matches) {
      const [traceId, spanId, sampled] = matches;
      return new Span({
        ...spanProps,
        sampled,
        spanId,
        traceId,
      });
    }
    return undefined;
  }

  /**
   * Sets the finish timestamp on the current span
   */
  public finish(): void {
    this.timestamp = new Date().getTime();
    this.finishedSpans.push(this);
  }

  /**
   * @inheritDoc
   */
  public toTraceparent(): string {
    return `${this._traceId}-${this._spanId}${this.sampled ? '-1' : '0'}`;
  }

  /**
   * @inheritDoc
   */
  public getTraceContext(): object {
    return {
      data: this.data,
      description: this.description,
      op: this.op,
      parent_span_id: this._parentSpanId,
      span_id: this._spanId,
      tags: this.tags,
      trace_id: this._traceId,
    };
  }

  /**
   * @inheritDoc
   */
  public toJSON(): object {
    return {
      data: this.data,
      description: this.description,
      op: this.op,
      parent_span_id: this._parentSpanId,
      sampled: this.sampled,
      span_id: this._spanId,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.timestamp,
      trace_id: this._traceId,
      transaction: this.transaction,
    };
  }
}
