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
  private _openSpanCount: number = 0;
  public finishedSpans: Span[] = [];

  public constructor(maxlen: number) {
    this._maxlen = maxlen;
  }

  /**
   * This is just so that we don't run out of memory while recording a lot
   * of spans. At some point we just stop and flush out the start of the
   * trace tree (i.e.the first n spans with the smallest
   * start_timestamp).
   */
  public startSpan(span: Span): void {
    this._openSpanCount += 1;
    if (this._openSpanCount > this._maxlen) {
      span.spanRecorder = undefined;
    }
  }

  /**
   * Appends a span to finished spans table
   * @param span Span to be added
   */
  public finishSpan(span: Span): void {
    this.finishedSpans.push(span);
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
   * @inheritDoc
   */
  public sampled?: boolean;

  /**
   * Timestamp in seconds when the span was created.
   */
  public startTimestamp: number = timestampWithMs();

  /**
   * Finish timestamp of the span.
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
  }

  /**
   * Attaches SpanRecorder to the span itself
   * @param maxlen maximum number of spans that can be recorded
   */
  public initFinishedSpans(maxlen: number = 1000): void {
    if (!this.spanRecorder) {
      this.spanRecorder = new SpanRecorder(maxlen);
    }
    this.spanRecorder.startSpan(this);
  }

  /**
   * Creates a new `Span` while setting the current `Span.id` as `parentSpanId`.
   * Also the `sampled` decision will be inherited.
   */
  public child(spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId'>>): Span {
    const span = new Span({
      ...spanContext,
      parentSpanId: this._spanId,
      sampled: this.sampled,
      traceId: this._traceId,
    });

    span.spanRecorder = this.spanRecorder;

    return span;
  }

  /**
   * Continues a trace from a string (usually the header).
   * @param traceparent Traceparent string
   */
  public static fromTraceparent(
    traceparent: string,
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceid'>>,
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
    this.setTag('status', value);
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
    return this.tags.status === SpanStatus.Ok;
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

    if (this.spanRecorder === undefined) {
      return undefined;
    }

    this.spanRecorder.finishSpan(this);

    if (this.transaction === undefined) {
      // If this has no transaction set we assume there's a parent
      // transaction for this span that would be flushed out eventually.
      return undefined;
    }

    if (this.sampled === undefined) {
      // At this point a `sampled === undefined` should have already been
      // resolved to a concrete decision. If `sampled` is `undefined`, it's
      // likely that somebody used `Sentry.startSpan(...)` on a
      // non-transaction span and later decided to make it a transaction.
      logger.warn('Discarding transaction Span without sampling decision');
      return undefined;
    }

    const finishedSpans = this.spanRecorder ? this.spanRecorder.finishedSpans.filter(s => s !== this) : [];

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
  public getTraceContext(): object {
    return dropUndefinedKeys({
      data: this.data,
      description: this.description,
      op: this.op,
      parent_span_id: this._parentSpanId,
      span_id: this._spanId,
      status: this.tags.status,
      tags: this.tags,
      trace_id: this._traceId,
    });
  }

  /**
   * @inheritDoc
   */
  public toJSON(): object {
    return dropUndefinedKeys({
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
    });
  }
}
