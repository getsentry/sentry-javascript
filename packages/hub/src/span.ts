import { Span as SpanInterface, SpanContext } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

export const TRACEPARENT_REGEXP = /^[ \t]*([0-9a-f]{32})?-?([0-9a-f]{16})?-?([01])?[ \t]*$/;

/**
 * Span contains all data about a span
 */
export class Span implements SpanInterface, SpanContext {
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
  public readonly sampled?: boolean;

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

  public constructor(SpanContext?: SpanContext) {
    if (!SpanContext) {
      return this;
    }

    if (SpanContext.traceId) {
      this._traceId = SpanContext.traceId;
    }
    if (SpanContext.spanId) {
      this._spanId = SpanContext.spanId;
    }
    if (SpanContext.parentSpanId) {
      this._parentSpanId = SpanContext.parentSpanId;
    }
    if (SpanContext.sampled) {
      this.sampled = SpanContext.sampled;
    }
    if (SpanContext.transaction) {
      this.transaction = SpanContext.transaction;
    }
    if (SpanContext.op) {
      this.op = SpanContext.op;
    }
    if (SpanContext.description) {
      this.description = SpanContext.description;
    }
    if (SpanContext.data) {
      this.data = SpanContext.data;
    }
    if (SpanContext.tags) {
      this.tags = SpanContext.tags;
    }
  }

  /** JSDoc */
  public newSpan(SpanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId'>>): Span {
    const span = new Span({
      ...SpanContext,
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
    SpanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceid'>>,
  ): Span | undefined {
    const matches = traceparent.match(TRACEPARENT_REGEXP);
    if (matches) {
      let sampled: boolean | undefined;
      if (matches[3] === '1') {
        sampled = true;
      } else if (matches[3] === '0') {
        sampled = false;
      }

      return new Span({
        ...SpanContext,
        parentSpanId: matches[2],
        sampled,
        traceId: matches[1],
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
    let sampledString = '';
    if (this.sampled !== undefined) {
      sampledString = this.sampled ? '-1' : '-0';
    }
    return `${this._traceId}-${this._spanId}${sampledString}`;
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
