/* eslint-disable max-lines */
import { getCurrentHub, Hub } from '@sentry/hub';
import { Primitive, Span as SpanInterface, SpanContext, TraceHeaders, Transaction } from '@sentry/types';
import { dropUndefinedKeys, logger, timestampWithMs, uuid4 } from '@sentry/utils';

import { SpanStatus } from './spanstatus';
import { computeTracestateValue } from './utils';

/**
 * Keeps track of finished spans for a given transaction
 * @internal
 * @hideconstructor
 * @hidden
 */
export class SpanRecorder {
  public spans: Span[] = [];

  private readonly _maxlen: number;

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
export class Span implements SpanInterface {
  /**
   * @inheritDoc
   */
  public traceId: string = uuid4();

  /**
   * @inheritDoc
   */
  public spanId: string = uuid4().substring(16);

  /**
   * @inheritDoc
   */
  public parentSpanId?: string;

  /**
   * Internal keeper of the status
   */
  public status?: SpanStatus | string;

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
  public endTimestamp?: number;

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
  public tags: { [key: string]: Primitive } = {};

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public data: { [key: string]: any } = {};

  /**
   * List of spans that were finalized
   */
  public spanRecorder?: SpanRecorder;

  /**
   * @inheritDoc
   */
  public transaction?: Transaction;

  /**
   * You should never call the constructor manually, always use `Sentry.startTransaction()`
   * or call `startChild()` on an existing span.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(spanContext?: SpanContext) {
    if (!spanContext) {
      return this;
    }
    if (spanContext.traceId) {
      this.traceId = spanContext.traceId;
    }
    if (spanContext.spanId) {
      this.spanId = spanContext.spanId;
    }
    if (spanContext.parentSpanId) {
      this.parentSpanId = spanContext.parentSpanId;
    }
    // check this way instad of the normal way to make sure we don't miss cases where sampled = false
    if ('sampled' in spanContext) {
      this.sampled = spanContext.sampled;
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
      this.status = spanContext.status;
    }
    if (spanContext.startTimestamp) {
      this.startTimestamp = spanContext.startTimestamp;
    }
    if (spanContext.endTimestamp) {
      this.endTimestamp = spanContext.endTimestamp;
    }
  }

  /**
   * @inheritDoc
   * @deprecated
   */
  public child(
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>,
  ): Span {
    return this.startChild(spanContext);
  }

  /**
   * @inheritDoc
   */
  public startChild(
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>,
  ): Span {
    const childSpan = new Span({
      ...spanContext,
      parentSpanId: this.spanId,
      sampled: this.sampled,
      traceId: this.traceId,
    });

    childSpan.spanRecorder = this.spanRecorder;
    if (childSpan.spanRecorder) {
      childSpan.spanRecorder.add(childSpan);
    }

    childSpan.transaction = this.transaction;

    return childSpan;
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: Primitive): this {
    this.tags = { ...this.tags, [key]: value };
    return this;
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public setData(key: string, value: any): this {
    this.data = { ...this.data, [key]: value };
    return this;
  }

  /**
   * @inheritDoc
   */
  public setStatus(value: SpanStatus): this {
    this.status = value;
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
    return this.status === SpanStatus.Ok;
  }

  /**
   * @inheritDoc
   */
  public finish(endTimestamp?: number): void {
    this.endTimestamp = typeof endTimestamp === 'number' ? endTimestamp : timestampWithMs();
  }

  /**
   * @inheritDoc
   */
  public toTraceparent(): string {
    logger.warn('Direct use of `span.toTraceparent` is deprecated. Use `span.getTraceHeaders` instead.');

    return this._toSentrytrace();
  }

  /**
   * @inheritDoc
   */
  public toContext(): SpanContext {
    return dropUndefinedKeys({
      data: this.data,
      description: this.description,
      endTimestamp: this.endTimestamp,
      op: this.op,
      parentSpanId: this.parentSpanId,
      sampled: this.sampled,
      spanId: this.spanId,
      startTimestamp: this.startTimestamp,
      status: this.status,
      tags: this.tags,
      traceId: this.traceId,
    });
  }

  /**
   * @inheritDoc
   */
  public updateWithContext(spanContext: SpanContext): this {
    this.data = spanContext.data ?? {};
    this.description = spanContext.description;
    this.endTimestamp = spanContext.endTimestamp;
    this.op = spanContext.op;
    this.parentSpanId = spanContext.parentSpanId;
    this.sampled = spanContext.sampled;
    this.spanId = spanContext.spanId ?? this.spanId;
    this.startTimestamp = spanContext.startTimestamp ?? this.startTimestamp;
    this.status = spanContext.status;
    this.tags = spanContext.tags ?? {};
    this.traceId = spanContext.traceId ?? this.traceId;

    return this;
  }

  /**
   * @inheritDoc
   */
  public getTraceHeaders(): TraceHeaders {
    // if this span is part of a transaction, but that transaction doesn't yet have a tracestate value, create one
    if (this.transaction && !this.transaction?.metadata.tracestate?.sentry) {
      this.transaction.metadata.tracestate = {
        ...this.transaction.metadata.tracestate,
        sentry: this._getNewTracestate(),
      };
    }

    const tracestate = this._toTracestate();

    return {
      'sentry-trace': this._toSentrytrace(),
      ...(tracestate && { tracestate }),
    };
  }

  /**
   * @inheritDoc
   */
  public getTraceContext(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: { [key: string]: any };
    description?: string;
    op?: string;
    parent_span_id?: string;
    span_id: string;
    status?: string;
    tags?: { [key: string]: Primitive };
    trace_id: string;
  } {
    return dropUndefinedKeys({
      data: Object.keys(this.data).length > 0 ? this.data : undefined,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      status: this.status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : undefined,
      trace_id: this.traceId,
    });
  }

  /**
   * @inheritDoc
   */
  public toJSON(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: { [key: string]: any };
    description?: string;
    op?: string;
    parent_span_id?: string;
    span_id: string;
    start_timestamp: number;
    status?: string;
    tags?: { [key: string]: Primitive };
    timestamp?: number;
    trace_id: string;
  } {
    return dropUndefinedKeys({
      data: Object.keys(this.data).length > 0 ? this.data : undefined,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      start_timestamp: this.startTimestamp,
      status: this.status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : undefined,
      timestamp: this.endTimestamp,
      trace_id: this.traceId,
    });
  }

  /**
   * Create a new Sentry tracestate header entry (i.e. `sentry=xxxxxx`)
   *
   * @returns The new Sentry tracestate entry, or undefined if there's no client or no dsn
   */
  protected _getNewTracestate(): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const hub = ((this.transaction as any)?._hub as Hub) || getCurrentHub();
    const client = hub.getClient();
    const { id: userId, segment: userSegment } = hub.getScope()?.getUser() || {};
    const dsn = client?.getDsn();

    if (!client || !dsn) {
      return;
    }

    const { environment, release } = client.getOptions() || {};

    // TODO - the only reason we need the non-null assertion on `dsn.publicKey` (below) is because `dsn.publicKey` has
    // to be optional while we transition from `dsn.user` -> `dsn.publicKey`. Once `dsn.user` is removed, we can make
    // `dsn.publicKey` required and remove the `!`.

    return `sentry=${computeTracestateValue({
      trace_id: this.traceId,
      environment,
      release,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      public_key: dsn.publicKey!,
      user: { id: userId, segment: userSegment },
    })}`;
  }

  /**
   * Return a traceparent-compatible header string.
   */
  private _toSentrytrace(): string {
    let sampledString = '';
    if (this.sampled !== undefined) {
      sampledString = this.sampled ? '-1' : '-0';
    }
    return `${this.traceId}-${this.spanId}${sampledString}`;
  }

  /**
   * Return a tracestate-compatible header string, including both sentry and third-party data (if any). Returns
   * undefined if there is no client or no DSN.
   */
  private _toTracestate(): string | undefined {
    // if this is an orphan span, create a new tracestate value
    const sentryTracestate = this.transaction?.metadata?.tracestate?.sentry || this._getNewTracestate();
    let thirdpartyTracestate = this.transaction?.metadata?.tracestate?.thirdparty;

    // if there's third-party data, add a leading comma; otherwise, convert from `undefined` to the empty string, so the
    // end result doesn’t come out as `sentry=xxxxxundefined`
    thirdpartyTracestate = thirdpartyTracestate ? `,${thirdpartyTracestate}` : '';

    return `${sentryTracestate}${thirdpartyTracestate}`;
  }
}
