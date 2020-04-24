// tslint:disable:max-classes-per-file

import { getCurrentHub, Hub } from '@sentry/hub';
import { Span as SpanInterface, SpanContext, SpanStatus } from '@sentry/types';
import { dropUndefinedKeys, isInstanceOf, logger, timestampWithMs, uuid4 } from '@sentry/utils';

// TODO: Should this be exported?
export const TRACEPARENT_REGEXP = new RegExp(
  '^[ \\t]*' + // whitespace
  '([0-9a-f]{32})?' + // trace_id
  '-?([0-9a-f]{16})?' + // span_id
  '-?([01])?' + // sampled
    '[ \\t]*$', // whitespace
);

/**
 * Keeps track of finished spans for a given transaction
 */
class SpanRecorder {
  private readonly _maxlen: number;
  public spans: Span[] = [];

  public constructor(maxlen: number = 1000) {
    this._maxlen = maxlen;
  }

  /**
   * This is just so that we don't run out of memory while recording a lot
   * of spans. At some point we just stop and flush out the start of the
   * trace tree (i.e.the first n spans with the smallest
   * start_timestamp).
   */
  public add(span: Span): void {
    if (this.spans.length > this._maxlen) {
      span.spanRecorder = undefined;
    } else {
      this.spans.push(span);
    }
  }
}

/**
 * Span contains all data about a span
 */
export class Span implements SpanInterface, SpanContext {
  /**
   * The reference to the current hub.
   */
  private readonly _hub: Hub = (getCurrentHub() as unknown) as Hub;

  /**
   * @inheritDoc
   */
  private readonly _traceId: string = uuid4();

  /**
   * @inheritDoc
   */
  private readonly _spanId: string = uuid4().substring(16);

  /**
   * @inheritDoc
   */
  private readonly _parentSpanId?: string;

  /**
   * Internal keeper of the status
   */
  private _status?: SpanStatus;

  /**
   * @inheritDoc
   */
  public sampled?: boolean;

  /**
   * Timestamp in seconds when the span was created.
   */
  public startTimestamp: number = timestampWithMs();

  /**
   * Timestamp in seconds when the span ended.
   */
  public timestamp?: number;

  /**
   * @inheritDoc
   */
  public transaction?: string;

  /**
   * @inheritDoc
   */
  public op?: string;

  /**
   * @inheritDoc
   */
  public description?: string;

  /**
   * @inheritDoc
   */
  public tags: { [key: string]: string } = {};

  /**
   * @inheritDoc
   */
  public data: { [key: string]: any } = {};

  /**
   * List of spans that were finalized
   */
  public spanRecorder?: SpanRecorder;

  /**
   * You should never call the custructor manually, always use `hub.startSpan()`.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(spanContext?: SpanContext, hub?: Hub) {
    if (isInstanceOf(hub, Hub)) {
      this._hub = hub as Hub;
    }

    if (!spanContext) {
      return this;
    }

    if (spanContext.traceId) {
      this._traceId = spanContext.traceId;
    }
    if (spanContext.spanId) {
      this._spanId = spanContext.spanId;
    }
    if (spanContext.parentSpanId) {
      this._parentSpanId = spanContext.parentSpanId;
    }
    // We want to include booleans as well here
    if ('sampled' in spanContext) {
      this.sampled = spanContext.sampled;
    }
    if (spanContext.transaction) {
      this.transaction = spanContext.transaction;
    }
    if (spanContext.op) {
      this.op = spanContext.op;
    }
    if (spanContext.description) {
      this.description = spanContext.description;
    }
    if (spanContext.data) {
      this.data = spanContext.data;
    }
    if (spanContext.tags) {
      this.tags = spanContext.tags;
    }
    if (spanContext.status) {
      this._status = spanContext.status;
    }
  }

  /**
   * Attaches SpanRecorder to the span itself
   * @param maxlen maximum number of spans that can be recorded
   */
  public initSpanRecorder(maxlen: number = 1000): void {
    if (!this.spanRecorder) {
      this.spanRecorder = new SpanRecorder(maxlen);
    }
    this.spanRecorder.add(this);
  }

  /**
   * @inheritDoc
   */
  public child(
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>,
  ): Span {
    const span = new Span({
      ...spanContext,
      parentSpanId: this._spanId,
      sampled: this.sampled,
      traceId: this._traceId,
    });

    span.spanRecorder = this.spanRecorder;
    if (span.spanRecorder) {
      span.spanRecorder.add(span);
    }

    return span;
  }

  /**
   * Create a child with a async callback
   */
  public async withChild(
    spanContext: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>> = {},
    callback?: (span: Span) => Promise<void>,
  ): Promise<void> {
    const child = this.child(spanContext);
    if (callback) {
      await callback(child);
    }
    child.finish();
  }

  /**
   * @inheritDoc
   */
  public isRootSpan(): boolean {
    return this._parentSpanId === undefined;
  }

  /**
   * Continues a trace from a string (usually the header).
   * @param traceparent Traceparent string
   */
  public static fromTraceparent(
    traceparent: string,
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>,
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
        ...spanContext,
        parentSpanId: matches[2],
        sampled,
        traceId: matches[1],
      });
    }
    return undefined;
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: string): this {
    this.tags = { ...this.tags, [key]: value };
    return this;
  }

  /**
   * @inheritDoc
   */
  public setData(key: string, value: any): this {
    this.data = { ...this.data, [key]: value };
    return this;
  }

  /**
   * @inheritDoc
   */
  public setStatus(value: SpanStatus): this {
    this._status = value;
    return this;
  }

  /**
   * @inheritDoc
   */
  public setHttpStatus(httpStatus: number): this {
    this.setTag('http.status_code', String(httpStatus));
    const spanStatus = SpanStatus.fromHttpCode(httpStatus);
    if (spanStatus !== SpanStatus.UnknownError) {
      this.setStatus(spanStatus);
    }
    return this;
  }

  /**
   * @inheritDoc
   */
  public isSuccess(): boolean {
    return this._status === SpanStatus.Ok;
  }

  /**
   * Sets the finish timestamp on the current span.
   * @param trimEnd If true, sets the end timestamp of the transaction to the highest timestamp of child spans, trimming
   * the duration of the transaction span. This is useful to discard extra time in the transaction span that is not
   * accounted for in child spans, like what happens in the idle transaction Tracing integration, where we finish the
   * transaction after a given "idle time" and we don't want this "idle time" to be part of the transaction.
   */
  public finish(trimEnd: boolean = false): string | undefined {
    // This transaction is already finished, so we should not flush it again.
    if (this.timestamp !== undefined) {
      return undefined;
    }

    this.timestamp = timestampWithMs();

    // We will not send any child spans
    if (!this.isRootSpan()) {
      return undefined;
    }

    // This happens if a span was initiated outside of `hub.startSpan`
    // Also if the span was sampled (sampled = false) in `hub.startSpan` already
    if (this.spanRecorder === undefined) {
      return undefined;
    }

    if (this.sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      logger.warn('Discarding transaction Span because it was span.sampled !== true');
      return undefined;
    }

    const finishedSpans = this.spanRecorder ? this.spanRecorder.spans.filter(s => s !== this && s.timestamp) : [];

    if (trimEnd && finishedSpans.length > 0) {
      this.timestamp = finishedSpans.reduce((prev: Span, current: Span) => {
        if (prev.timestamp && current.timestamp) {
          return prev.timestamp > current.timestamp ? prev : current;
        }
        return prev;
      }).timestamp;
    }

    return this._hub.captureEvent({
      contexts: {
        trace: this.getTraceContext(),
      },
      spans: finishedSpans,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.timestamp,
      transaction: this.transaction,
      type: 'transaction',
    });
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
  public getTraceContext(): {
    data?: { [key: string]: any };
    description?: string;
    op?: string;
    parent_span_id?: string;
    span_id: string;
    status?: string;
    tags?: { [key: string]: string };
    trace_id: string;
  } {
    return dropUndefinedKeys({
      data: Object.keys(this.data).length > 0 ? this.data : undefined,
      description: this.description,
      op: this.op,
      parent_span_id: this._parentSpanId,
      span_id: this._spanId,
      status: this._status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : undefined,
      trace_id: this._traceId,
    });
  }

  /**
   * @inheritDoc
   */
  public toJSON(): {
    data?: { [key: string]: any };
    description?: string;
    op?: string;
    parent_span_id?: string;
    sampled?: boolean;
    span_id: string;
    start_timestamp: number;
    tags?: { [key: string]: string };
    timestamp?: number;
    trace_id: string;
    transaction?: string;
  } {
    return dropUndefinedKeys({
      data: Object.keys(this.data).length > 0 ? this.data : undefined,
      description: this.description,
      op: this.op,
      parent_span_id: this._parentSpanId,
      sampled: this.sampled,
      span_id: this._spanId,
      start_timestamp: this.startTimestamp,
      tags: Object.keys(this.tags).length > 0 ? this.tags : undefined,
      timestamp: this.timestamp,
      trace_id: this._traceId,
      transaction: this.transaction,
    });
  }
}
