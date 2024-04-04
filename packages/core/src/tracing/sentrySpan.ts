import type {
  SentrySpanArguments,
  Span,
  SpanAttributeValue,
  SpanAttributes,
  SpanContextData,
  SpanJSON,
  SpanOrigin,
  SpanStatus,
  SpanTimeInput,
  TimedEvent,
} from '@sentry/types';
import { dropUndefinedKeys, logger, timestampInSeconds, uuid4 } from '@sentry/utils';
import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';

import { getMetricSummaryJsonForSpan } from '../metrics/metric-summary';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import { TRACE_FLAG_NONE, TRACE_FLAG_SAMPLED, getStatusMessage, spanTimeInputToSeconds } from '../utils/spanUtils';
import { logSpanEnd } from './logSpans';

/**
 * Span contains all data about a span
 */
export class SentrySpan implements Span {
  protected _traceId: string;
  protected _spanId: string;
  protected _parentSpanId?: string | undefined;
  protected _sampled: boolean | undefined;
  protected _name?: string | undefined;
  protected _attributes: SpanAttributes;
  /** Epoch timestamp in seconds when the span started. */
  protected _startTime: number;
  /** Epoch timestamp in seconds when the span ended. */
  protected _endTime?: number | undefined;
  /** Internal keeper of the status */
  protected _status?: SpanStatus;
  /** The timed events added to this span. */
  protected _events: TimedEvent[];

  /**
   * You should never call the constructor manually, always use `Sentry.startSpan()`
   * or other span methods.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(spanContext: SentrySpanArguments = {}) {
    this._traceId = spanContext.traceId || uuid4();
    this._spanId = spanContext.spanId || uuid4().substring(16);
    this._startTime = spanContext.startTimestamp || timestampInSeconds();

    this._attributes = {};
    this.setAttributes({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: spanContext.op,
      ...spanContext.attributes,
    });

    this._name = spanContext.name;

    if (spanContext.parentSpanId) {
      this._parentSpanId = spanContext.parentSpanId;
    }
    // We want to include booleans as well here
    if ('sampled' in spanContext) {
      this._sampled = spanContext.sampled;
    }
    if (spanContext.endTimestamp) {
      this._endTime = spanContext.endTimestamp;
    }

    this._events = [];
  }

  /** @inheritdoc */
  public spanContext(): SpanContextData {
    const { _spanId: spanId, _traceId: traceId, _sampled: sampled } = this;
    return {
      spanId,
      traceId,
      traceFlags: sampled ? TRACE_FLAG_SAMPLED : TRACE_FLAG_NONE,
    };
  }

  /** @inheritdoc */
  public setAttribute(key: string, value: SpanAttributeValue | undefined): void {
    if (value === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this._attributes[key];
    } else {
      this._attributes[key] = value;
    }
  }

  /** @inheritdoc */
  public setAttributes(attributes: SpanAttributes): void {
    Object.keys(attributes).forEach(key => this.setAttribute(key, attributes[key]));
  }

  /**
   * This should generally not be used,
   * but we need it for browser tracing where we want to adjust the start time afterwards.
   * USE THIS WITH CAUTION!
   *
   * @hidden
   * @internal
   */
  public updateStartTime(timeInput: SpanTimeInput): void {
    this._startTime = spanTimeInputToSeconds(timeInput);
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
  public updateName(name: string): this {
    this._name = name;
    return this;
  }

  /** @inheritdoc */
  public end(endTimestamp?: SpanTimeInput): void {
    // If already ended, skip
    if (this._endTime) {
      return;
    }

    this._endTime = spanTimeInputToSeconds(endTimestamp);
    logSpanEnd(this);

    this._onSpanEnded();
  }

  /**
   * Get JSON representation of this span.
   *
   * @hidden
   * @internal This method is purely for internal purposes and should not be used outside
   * of SDK code. If you need to get a JSON representation of a span,
   * use `spanToJSON(span)` instead.
   */
  public getSpanJSON(): SpanJSON {
    return dropUndefinedKeys({
      data: this._attributes,
      description: this._name,
      op: this._attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP],
      parent_span_id: this._parentSpanId,
      span_id: this._spanId,
      start_timestamp: this._startTime,
      status: getStatusMessage(this._status),
      timestamp: this._endTime,
      trace_id: this._traceId,
      origin: this._attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] as SpanOrigin | undefined,
      _metrics_summary: getMetricSummaryJsonForSpan(this),
    });
  }

  /** @inheritdoc */
  public isRecording(): boolean {
    return !this._endTime && !!this._sampled;
  }

  /**
   * @inheritdoc
   */
  public addEvent(
    name: string,
    attributesOrStartTime?: SpanAttributes | SpanTimeInput,
    startTime?: SpanTimeInput,
  ): this {
    DEBUG_BUILD && logger.log('[Tracing] Adding an event to span:', name);

    const time = isSpanTimeInput(attributesOrStartTime) ? attributesOrStartTime : startTime || timestampInSeconds();
    const attributes = isSpanTimeInput(attributesOrStartTime) ? {} : attributesOrStartTime || {};

    const event: TimedEvent = {
      name,
      time: spanTimeInputToSeconds(time),
      attributes,
    };

    this._events.push(event);

    return this;
  }

  /** Emit `spanEnd` when the span is ended. */
  private _onSpanEnded(): void {
    const client = getClient();
    if (client) {
      client.emit('spanEnd', this);
    }
  }
}

function isSpanTimeInput(value: undefined | SpanAttributes | SpanTimeInput): value is SpanTimeInput {
  return (value && typeof value === 'number') || value instanceof Date || Array.isArray(value);
}
