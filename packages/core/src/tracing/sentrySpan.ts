import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import {
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_PROFILE_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../semanticAttributes';
import type { SpanLink } from '../types/link';
import type {
  SentrySpanArguments,
  Span,
  SpanAttributes,
  SpanAttributeValue,
  SpanContextData,
  SpanJSON,
  SpanOrigin,
  SpanTimeInput,
  StreamedSpanJSON,
} from '../types/span';
import type { SpanStatus } from '../types/spanStatus';
import type { TimedEvent } from '../types/timedEvent';
import { debug } from '../utils/debug-logger';
import { generateSpanId, generateTraceId } from '../utils/propagationContext';
import {
  addStatusMessageAttribute,
  convertSpanLinksForEnvelope,
  getRootSpan,
  getSimpleStatus,
  getStatusMessage,
  getStreamedSpanLinks,
  spanTimeInputToSeconds,
  TRACE_FLAG_NONE,
  TRACE_FLAG_SAMPLED,
} from '../utils/spanUtils';
import { timestampInSeconds } from '../utils/time';
import { logSpanEnd } from './logSpans';
import { timedEventsToMeasurements } from './measurement';
import { markSpanSourceAsExplicit, spanIsTracerProviderSpan, spanShouldInferOtelSource } from './utils';

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
  protected _links?: SpanLink[];
  /** Epoch timestamp in seconds when the span started. */
  protected _startTime: number;
  /** Epoch timestamp in seconds when the span ended. */
  protected _endTime?: number | undefined;
  /** Internal keeper of the status */
  protected _status?: SpanStatus;
  /** The timed events added to this span. */
  protected _events: TimedEvent[];

  /** if true, the span is sealed and ignores further mutations (set after end for tracer-provider spans) */
  private _frozen?: boolean;

  /**
   * You should never call the constructor manually, always use `Sentry.startSpan()`
   * or other span methods.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(spanContext: SentrySpanArguments = {}) {
    this._traceId = spanContext.traceId || generateTraceId();
    this._spanId = spanContext.spanId || generateSpanId();
    this._startTime = spanContext.startTimestamp || timestampInSeconds();
    this._links = spanContext.links;

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

  /** @inheritDoc */
  public addLink(link: SpanLink): this {
    if (this._frozen) {
      return this;
    }
    if (this._links) {
      this._links.push(link);
    } else {
      this._links = [link];
    }
    return this;
  }

  /** @inheritDoc */
  public addLinks(links: SpanLink[]): this {
    if (this._frozen) {
      return this;
    }
    if (this._links) {
      this._links.push(...links);
    } else {
      this._links = links;
    }
    return this;
  }

  /**
   * This should generally not be used,
   * but it is needed for being compliant with the OTEL Span interface.
   *
   * @hidden
   * @internal
   */
  public recordException(_exception: unknown, _time?: SpanTimeInput | undefined): void {
    // noop
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
  public setAttribute(key: string, value: SpanAttributeValue | undefined): this {
    if (this._frozen) {
      return this;
    }

    if (value === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this._attributes[key];
    } else {
      this._attributes[key] = value;
    }

    // Setting the source on a span branded for OTel-style inference means user code is choosing it
    // explicitly, so flag it to keep `applyOtelSpanData` from overriding it with an inferred source.
    if (key === SEMANTIC_ATTRIBUTE_SENTRY_SOURCE && value !== undefined && spanShouldInferOtelSource(this)) {
      markSpanSourceAsExplicit(this);
    }

    return this;
  }

  /** @inheritdoc */
  public setAttributes(attributes: SpanAttributes): this {
    Object.keys(attributes).forEach(key => this.setAttribute(key, attributes[key]));
    return this;
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
    if (this._frozen) {
      return;
    }
    this._startTime = spanTimeInputToSeconds(timeInput);
  }

  /**
   * @inheritDoc
   */
  public setStatus(value: SpanStatus): this {
    if (this._frozen) {
      return this;
    }
    this._status = value;
    return this;
  }

  /**
   * @inheritDoc
   */
  public updateName(name: string): this {
    if (this._frozen) {
      return this;
    }
    this._name = name;
    // Renaming a span marks its name as explicitly chosen, so we stamp `custom`.
    // The exception is spans created by SentryTraceProvider: those are branded for
    // OTel-style source inference at span end (mirroring OTel SDK spans, which have
    // no Sentry source concept), so instrumentations renaming them must not pin
    // `custom` — applyOtelSpanData infers the correct source (e.g. 'route', 'task').
    if (!spanShouldInferOtelSource(this)) {
      this.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');
    }
    return this;
  }

  /** @inheritdoc */
  public end(endTimestamp?: SpanTimeInput): void {
    // If already ended, skip the end-of-span processing, but still seal a tracer-provider span. The
    // seal at the bottom of this method is skipped on this early return, and `_endTime` may have been
    // set before this first `end()` call (e.g. via the constructor's `endTimestamp`), which would
    // otherwise leave the span mutable after `end()`. End-of-span processing already ran in that case.
    if (this._endTime) {
      this._frozen = spanIsTracerProviderSpan(this);
      return;
    }

    this._endTime = spanTimeInputToSeconds(endTimestamp);
    logSpanEnd(this);

    this._onSpanEnded();

    // A span created by the SentryTracerProvider is handed to OTel instrumentations as an OTel span,
    // so once end-of-span processing is done (including the `spanEnd` hook where `applyOtelSpanData`
    // finalizes status/source) it is sealed against further writes — mirroring the OpenTelemetry SDK,
    // where setters no-op after a span has ended. Without this, an instrumentation that sets
    // status/attributes after `end()` (e.g. Next.js on a render error) would overwrite the finalized
    // values, and the deferred capture would then serialize those late writes. Spans created directly
    // through the core API (e.g. the browser SDK, which backfills resource-timing attributes after a
    // span ends) are not tracer-provider spans and stay mutable.
    this._frozen = spanIsTracerProviderSpan(this);
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
    return {
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
      profile_id: this._attributes[SEMANTIC_ATTRIBUTE_PROFILE_ID] as string | undefined,
      exclusive_time: this._attributes[SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME] as number | undefined,
      measurements: timedEventsToMeasurements(this._events),
      links: convertSpanLinksForEnvelope(this._links),
    };
  }

  /**
   * Get {@link StreamedSpanJSON} representation of this span.
   *
   * @hidden
   * @internal This method is purely for internal purposes and should not be used outside
   * of SDK code. If you need to get a JSON representation of a span,
   * use `spanToStreamedSpanJSON(span)` instead.
   */
  public getStreamedSpanJSON(): StreamedSpanJSON {
    return {
      name: this._name ?? '',
      span_id: this._spanId,
      trace_id: this._traceId,
      parent_span_id: this._parentSpanId,
      start_timestamp: this._startTime,
      // just in case _endTime is not set, we use the start time (i.e. duration 0)
      end_timestamp: this._endTime ?? this._startTime,
      is_segment: this === getRootSpan(this),
      status: getSimpleStatus(this._status),
      attributes: addStatusMessageAttribute(this._attributes, this._status),
      links: getStreamedSpanLinks(this._links),
    };
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
    if (this._frozen) {
      return this;
    }
    DEBUG_BUILD && debug.log('[Tracing] Adding an event to span:', name);

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
    client?.emit('spanEnd', this);
    client?.emit('afterSpanEnd', this);

    // Child spans aren't captured on their own — the span streaming buffer picks them up.
    if (getRootSpan(this) !== this) {
      return;
    }

    client?.emit('afterSegmentSpanEnd', this);
  }
}

function isSpanTimeInput(value: undefined | SpanAttributes | SpanTimeInput): value is SpanTimeInput {
  return (value && typeof value === 'number') || value instanceof Date || Array.isArray(value);
}
