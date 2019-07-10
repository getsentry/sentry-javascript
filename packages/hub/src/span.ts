import { Span as SpanInterface, SpanDetails } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

export const TRACEPARENT_REGEXP = /^[ \t]*([0-9a-f]{32})?-?([0-9a-f]{16})?-?([01])?[ \t]*$/;

/**
 * Span containg all data about a span
 */
export class Span implements SpanInterface {
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
   * Set the transaction of the Span.
   */
  public transaction?: string;

  /**
   * Set the operation of the Span.
   */
  public op?: string;

  /**
   * Set the description of the Span.
   */
  public description?: string;

  /**
   * List of spans that were finalized
   */
  public finishedSpans: Span[] = [];

  public constructor(spanDetails?: SpanDetails) {
    if (!spanDetails) {
      return this;
    }

    if (spanDetails.traceId) {
      this._traceId = spanDetails.traceId;
    }
    if (spanDetails.spanId) {
      this._spanId = spanDetails.spanId;
    }
    if (spanDetails.parentSpanId) {
      this._parentSpanId = spanDetails.parentSpanId;
    }
    if (spanDetails.sampled) {
      this.sampled = spanDetails.sampled;
    }
    if (spanDetails.transaction) {
      this.transaction = spanDetails.transaction;
    }
    if (spanDetails.op) {
      this.op = spanDetails.op;
    }
    if (spanDetails.description) {
      this.description = spanDetails.description;
    }
  }

  /** JSDoc */
  public newSpan(spanDetails?: Pick<SpanDetails, Exclude<keyof SpanDetails, 'spanId'>>): Span {
    const span = new Span({
      ...spanDetails,
      parentSpanId: this._parentSpanId,
      sampled: this.sampled,
      traceId: this._traceId,
    });

    span.finishedSpans = this.finishedSpans;

    return span;
  }

  /**
   * Setter for transaction.
   */
  public setTransaction(transaction: string | undefined): this {
    this.transaction = transaction;
    return this;
  }

  /**
   * Continues a trace
   * @param traceparent Traceparent string
   */
  public static fromTraceparent(
    traceparent: string,
    spanDetails?: Pick<SpanDetails, Exclude<keyof SpanDetails, 'spanId' | 'sampled' | 'traceid'>>,
  ): Span | undefined {
    const matches = traceparent.match(TRACEPARENT_REGEXP);
    if (matches) {
      const [traceId, spanId, sampled] = matches;
      return new Span({
        ...spanDetails,
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
      description: this.description,
      op: this.op,
      parent_span_id: this._parentSpanId,
      span_id: this._spanId,
      trace_id: this._traceId,
    };
  }

  /**
   * @inheritDoc
   */
  public toJSON(): object {
    return {
      description: this.description,
      op: this.op,
      parent_span_id: this._parentSpanId,
      sampled: this.sampled,
      span_id: this._spanId,
      start_timestamp: this.startTimestamp,
      timestamp: this.timestamp,
      trace_id: this._traceId,
      transaction: this.transaction,
    };
  }
}
