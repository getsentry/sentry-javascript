/* eslint-disable max-lines */
import { getClient, getCurrentScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import {
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_PROFILE_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../semanticAttributes';
import type { Client } from '../client';
import type { TransactionEvent } from '../types/event';
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
  getSpanDescendants,
  getStatusMessage,
  getStreamedSpanLinks,
  spanTimeInputToSeconds,
  spanToJSON,
  spanToTransactionTraceContext,
  TRACE_FLAG_NONE,
  TRACE_FLAG_SAMPLED,
} from '../utils/spanUtils';
import { timestampInSeconds } from '../utils/time';
import { getDynamicSamplingContextFromSpan } from './dynamicSamplingContext';
import { logSpanEnd } from './logSpans';
import { timedEventsToMeasurements } from './measurement';
import { getSegmentSpanCaptureStrategy, type SegmentSpanCaptureConvertOptions } from './segmentSpanCaptureStrategy';
import { captureSpan } from './spans/captureSpan';
import { createStreamedSpanEnvelope } from './spans/envelope';
import { hasSpanStreamingEnabled } from './spans/hasSpanStreamingEnabled';
import {
  getCapturedScopesOnSpan,
  markSpanSourceAsExplicit,
  spanIsTracerProviderSpan,
  spanShouldInferOtelSource,
} from './utils';

const MAX_SPAN_COUNT = 1000;

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
   * If true, the span is sent on its own as a v2 streamed span and is never folded into a
   * transaction. Used for late web vital spans (INP) when span streaming is disabled.
   *
   * TODO(standalone): remove once the static (transaction) trace lifecycle is dropped and every
   * span streams on its own. See the matching markers on `isStandaloneSpan`/`sendStandaloneSpan`,
   * the `_convertSpanToTransaction` exclusion, and the `isStandalone`/`experimental.standalone` types.
   */
  private _isStandaloneSpan?: boolean;

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

    this._isStandaloneSpan = spanContext.isStandalone;

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

  /**
   * Whether this span is sent on its own (as a v2 streamed span) rather than as part of a
   * transaction. Used internally; see `_isStandaloneSpan`.
   * @internal
   */
  public isStandaloneSpan(): boolean {
    return !!this._isStandaloneSpan;
  }

  /** Emit `spanEnd` when the span is ended. */
  private _onSpanEnded(): void {
    const client = getClient();
    client?.emit('spanEnd', this);

    // A standalone span is sent on its own as a v2 streamed span and never becomes/joins a
    // transaction, so we send it here and stop.
    // TODO(standalone): once we drop the static (transaction) trace lifecycle entirely and everything
    // streams, standalone spans are no longer needed (every span streams on its own) and this branch,
    // the `_isStandaloneSpan` flag, and the `_convertSpanToTransaction` exclusion can all be removed.
    if (this._isStandaloneSpan) {
      if (!client) return;

      if (this._sampled) {
        sendStandaloneSpan(this, client);
        return;
      }

      DEBUG_BUILD && debug.log('[Tracing] Discarding standalone span because its trace was not chosen to be sampled.');
      client.recordDroppedEvent('sample_rate', 'span');

      return;
    }

    client?.emit('afterSpanEnd', this);

    // Child spans aren't captured on their own. A registered strategy may re-emit a late child
    // as its own orphan transaction; without one, it's dropped.
    const rootSpan = getRootSpan(this);
    if (rootSpan !== this) {
      const strategy = getSegmentSpanCaptureStrategy();
      if (strategy) {
        const scope = getCapturedScopesOnSpan(this).scope || getCurrentScope();
        strategy.onChildSpanEnded(this, rootSpan, options => this._convertSpanToTransaction(options), scope);
      }
      return;
    }

    if (client && hasSpanStreamingEnabled(client)) {
      client.emit('afterSegmentSpanEnd', this);
      return;
    }

    // A registered strategy defers the snapshot so children closing just after the segment still land
    // (and late ones can orphan); without one, assemble synchronously from the live tree.
    const scope = getCapturedScopesOnSpan(this).scope || getCurrentScope();
    const strategy = getSegmentSpanCaptureStrategy();
    if (strategy) {
      strategy.onSegmentSpanEnded(options => this._convertSpanToTransaction(options), scope);
    } else {
      const transactionEvent = this._convertSpanToTransaction();
      if (transactionEvent) {
        scope.captureEvent(transactionEvent);
      }
    }
  }

  /**
   * Finish the transaction & prepare the event to send to Sentry.
   */
  private _convertSpanToTransaction(options: SegmentSpanCaptureConvertOptions = {}): TransactionEvent | undefined {
    // We can only convert finished spans
    if (!isFullFinishedSpan(spanToJSON(this))) {
      return undefined;
    }

    if (!this._name) {
      DEBUG_BUILD && debug.warn('Transaction has no name, falling back to `<unlabeled transaction>`.');
      this._name = '<unlabeled transaction>';
    }

    const { scope: capturedSpanScope, isolationScope: capturedSpanIsolationScope } = getCapturedScopesOnSpan(this);

    const normalizedRequest = capturedSpanScope?.getScopeData().sdkProcessingMetadata?.normalizedRequest;

    if (this._sampled !== true) {
      return undefined;
    }

    // Skip the span itself, standalone spans (they are sent on their own), and (when a strategy
    // tracks it) spans already sent. The synchronous default passes no hooks, so this bookkeeping
    // stays out of SDKs that don't defer.
    // TODO(standalone): drop the `isStandaloneSpan(descendant)` check once the static trace lifecycle is gone.
    options.onSpanCaptured?.(this);
    const spans: SpanJSON[] = [];
    for (const descendant of getSpanDescendants(this)) {
      if (descendant === this || isStandaloneSpan(descendant) || options.isSpanAlreadyCaptured?.(descendant)) {
        continue;
      }
      const spanJSON = spanToJSON(descendant);
      if (!isFullFinishedSpan(spanJSON)) {
        continue;
      }
      options.onSpanCaptured?.(descendant);
      spans.push(spanJSON);
    }

    const source = this._attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

    // remove internal root span attributes we don't need to send.
    /* eslint-disable @typescript-eslint/no-dynamic-delete */
    delete this._attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
    let hasGenAiSpans = false;
    spans.forEach(span => {
      delete span.data[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
      if (span.op?.startsWith('gen_ai.')) {
        hasGenAiSpans = true;
      }
    });
    // eslint-enabled-next-line @typescript-eslint/no-dynamic-delete

    const transaction: TransactionEvent = {
      contexts: {
        trace: spanToTransactionTraceContext(this),
      },
      spans:
        // spans.sort() mutates the array, but `spans` is already a copy so we can safely do this here
        // we do not use spans anymore after this point
        spans.length > MAX_SPAN_COUNT
          ? spans.sort((a, b) => a.start_timestamp - b.start_timestamp).slice(0, MAX_SPAN_COUNT)
          : spans,
      start_timestamp: this._startTime,
      timestamp: this._endTime,
      transaction: this._name,
      type: 'transaction',
      sdkProcessingMetadata: {
        capturedSpanScope,
        capturedSpanIsolationScope,
        dynamicSamplingContext: getDynamicSamplingContextFromSpan(this),
        hasGenAiSpans,
      },
      request: normalizedRequest,
      ...(source && {
        transaction_info: {
          source,
        },
      }),
    };

    const measurements = timedEventsToMeasurements(this._events);
    const hasMeasurements = measurements && Object.keys(measurements).length;

    if (hasMeasurements) {
      DEBUG_BUILD &&
        debug.log(
          '[Measurements] Adding measurements to transaction event',
          JSON.stringify(measurements, undefined, 2),
        );
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

/**
 * `SentrySpan`s can be sent on their own (as a v2 streamed span) rather than as part of a transaction.
 *
 * TODO(standalone): remove once the static (transaction) trace lifecycle is dropped.
 */
function isStandaloneSpan(span: Span): boolean {
  return span instanceof SentrySpan && span.isStandaloneSpan();
}

/**
 * Sends a single span on its own, as a v2 streamed span envelope.
 *
 * Used for standalone spans (e.g. a late INP web vital when span streaming is disabled): they are
 * not part of a transaction and are not handled by the span streaming buffer, so we serialize and
 * send them here directly.
 *
 * TODO(standalone): remove once the static (transaction) trace lifecycle is dropped.
 */
function sendStandaloneSpan(span: SentrySpan, client: Client): void {
  const { _segmentSpan, ...serializedSpan } = captureSpan(span, client);
  const dsc = getDynamicSamplingContextFromSpan(_segmentSpan);
  // sendEnvelope should not throw
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  client.sendEnvelope(createStreamedSpanEnvelope([serializedSpan], dsc, client));
}
