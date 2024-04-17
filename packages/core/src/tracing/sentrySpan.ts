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
  TransactionEvent,
  TransactionSource,
} from '@sentry/types';
import { dropUndefinedKeys, logger, timestampInSeconds, uuid4 } from '@sentry/utils';
import { getClient, getCurrentScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';

import { getMetricSummaryJsonForSpan } from '../metrics/metric-summary';
import {
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_PROFILE_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../semanticAttributes';
import {
  TRACE_FLAG_NONE,
  TRACE_FLAG_SAMPLED,
  getRootSpan,
  getSpanDescendants,
  getStatusMessage,
  spanTimeInputToSeconds,
  spanToJSON,
  spanToTraceContext,
} from '../utils/spanUtils';
import { getDynamicSamplingContextFromSpan } from './dynamicSamplingContext';
import { logSpanEnd } from './logSpans';
import { timedEventsToMeasurements } from './measurement';
import { getCapturedScopesOnSpan } from './utils';

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

    // If the span is already ended, ensure we finalize the span immediately
    if (this._endTime) {
      this._onSpanEnded();
    }
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
      profile_id: this._attributes[SEMANTIC_ATTRIBUTE_PROFILE_ID] as string | undefined,
      exclusive_time: this._attributes[SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME] as number | undefined,
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

    // If this is a root span, send it when it is endedf
    if (this === getRootSpan(this)) {
      const transactionEvent = this._convertSpanToTransaction();
      if (transactionEvent) {
        const scope = getCapturedScopesOnSpan(this).scope || getCurrentScope();
        scope.captureEvent(transactionEvent);
      }
    }
  }

  /**
   * Finish the transaction & prepare the event to send to Sentry.
   */
  private _convertSpanToTransaction(): TransactionEvent | undefined {
    // We can only convert finished spans
    if (!isFullFinishedSpan(spanToJSON(this))) {
      return undefined;
    }

    if (!this._name) {
      DEBUG_BUILD && logger.warn('Transaction has no name, falling back to `<unlabeled transaction>`.');
      this._name = '<unlabeled transaction>';
    }

    const { scope: capturedSpanScope, isolationScope: capturedSpanIsolationScope } = getCapturedScopesOnSpan(this);
    const scope = capturedSpanScope || getCurrentScope();
    const client = scope.getClient() || getClient();

    if (this._sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      DEBUG_BUILD && logger.log('[Tracing] Discarding transaction because its trace was not chosen to be sampled.');

      if (client) {
        client.recordDroppedEvent('sample_rate', 'transaction');
      }

      return undefined;
    }

    // The transaction span itself should be filtered out
    const finishedSpans = getSpanDescendants(this).filter(span => span !== this);

    const spans = finishedSpans.map(span => spanToJSON(span)).filter(isFullFinishedSpan);

    const source = this._attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] as TransactionSource | undefined;

    const transaction: TransactionEvent = {
      contexts: {
        trace: spanToTraceContext(this),
      },
      spans,
      start_timestamp: this._startTime,
      timestamp: this._endTime,
      transaction: this._name,
      type: 'transaction',
      sdkProcessingMetadata: {
        capturedSpanScope,
        capturedSpanIsolationScope,
        ...dropUndefinedKeys({
          dynamicSamplingContext: getDynamicSamplingContextFromSpan(this),
        }),
      },
      _metrics_summary: getMetricSummaryJsonForSpan(this),
      ...(source && {
        transaction_info: {
          source,
        },
      }),
    };

    const measurements = timedEventsToMeasurements(this._events);
    const hasMeasurements = Object.keys(measurements).length;

    if (hasMeasurements) {
      DEBUG_BUILD &&
        logger.log('[Measurements] Adding measurements to transaction', JSON.stringify(measurements, undefined, 2));
      transaction.measurements = measurements;
    }

    return transaction;
  }
}

function isSpanTimeInput(value: undefined | SpanAttributes | SpanTimeInput): value is SpanTimeInput {
  return (value && typeof value === 'number') || value instanceof Date || Array.isArray(value);
}

// We want to filter out any incomplete SpanJSON objects
function isFullFinishedSpan(input: Partial<SpanJSON>): input is SpanJSON {
  return !!input.start_timestamp && !!input.timestamp && !!input.span_id && !!input.trace_id;
}
