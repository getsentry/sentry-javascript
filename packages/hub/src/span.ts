import { Span as SpanInterface, SpanContext } from '@sentry/types';
import { timestampWithMs, uuid4 } from '@sentry/utils';

import { getCurrentHub, Hub } from './hub';

export const TRACEPARENT_REGEXP = /^[ \t]*([0-9a-f]{32})?-?([0-9a-f]{16})?-?([01])?[ \t]*$/;

/**
 * Span contains all data about a span
 */
export class Span implements SpanInterface, SpanContext {
  /**
   * @inheritDoc
   */
  private readonly _hub: Hub = getCurrentHub();

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
  public readonly sampled?: boolean;

  /**
   * Timestamp when the span was created.
   */
  public readonly startTimestamp: number = timestampWithMs();

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
  public finishedSpans: Span[] = [];

  public constructor(spanContext?: SpanContext, hub?: Hub) {
    if (hub instanceof Hub) {
      this._hub = hub;
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
    if (spanContext.sampled) {
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
   * Creates a new `Span` while setting the current `Span.id` as `parentSpanId`.
   * Also the `sampled` decision will be inherited.
   */
  public newSpan(spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId'>>): Span {
    const span = new Span({
      ...spanContext,
      parentSpanId: this._spanId,
      sampled: this.sampled,
      traceId: this._traceId,
    });

    span.finishedSpans = this.finishedSpans;

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
   * Sets the tag attribute on the current span
   * @param key Tag key
   * @param value Tag value
   */
  public setTag(key: string, value: string): this {
    this.tags = { ...this.tags, [key]: value };
    return this;
  }

  /**
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   */
  public setData(key: string, value: any): this {
    this.data = { ...this.data, [key]: value };
    return this;
  }

  /**
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   */
  public setFailure(): this {
    this.setTag('status', 'failure');
    return this;
  }

  /**
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   */
  public setSuccess(): this {
    this.setTag('status', 'success');
    return this;
  }

  /**
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   */
  public isSuccess(): boolean {
    return this.tags.status !== 'failure';
  }

  /**
   * Sets the finish timestamp on the current span
   */
  public finish(): string | undefined {
    // Don't allow for finishing more than once
    if (typeof this.timestamp === 'number') {
      return undefined;
    }

    this.timestamp = timestampWithMs();
    this.finishedSpans.push(this);

    // Don't send non-transaction spans
    if (typeof this.transaction !== 'string') {
      return undefined;
    }

    // TODO: if sampled do what?
    const finishedSpans = this.finishedSpans.filter(s => s !== this);
    this.finishedSpans = [];

    return this._hub.captureEvent({
      contexts: { trace: this.getTraceContext() },
      spans: finishedSpans.length > 0 ? finishedSpans : undefined,
      start_timestamp: this.startTimestamp,
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
    const context = {
      data: this.data,
      description: this.description,
      op: this.op,
      parent_span_id: this._parentSpanId,
      span_id: this._spanId,
      tags: this.tags,
      trace_id: this._traceId,
    };

    if (this.tags.status) {
      // TODO: Fixme, just use better typings
      (context as any).status = this.tags.status;
    }

    return context;
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
