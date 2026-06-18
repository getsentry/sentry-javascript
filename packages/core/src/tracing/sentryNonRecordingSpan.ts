import type { EventDropReason } from '../types/clientreport';
import type {
  SentrySpanArguments,
  Span,
  SpanAttributes,
  SpanAttributeValue,
  SpanContextData,
  SpanTimeInput,
} from '../types/span';
import type { SpanStatus } from '../types/spanStatus';
import { addNonEnumerableProperty } from '../utils/object';
import { generateSpanId, generateTraceId } from '../utils/propagationContext';
import { TRACE_FLAG_NONE } from '../utils/spanUtils';

interface SentryNonRecordingSpanArguments extends SentrySpanArguments {
  dropReason?: EventDropReason;
}

// Brand used to detect non-recording spans via {@link spanIsNonRecordingSpan} without `instanceof`,
// which is brittle when `@sentry/core` is duplicated across packages. We use `Symbol.for` so the key
// is shared across copies of the module, and so user payloads (e.g. JSON) cannot spoof the marker.
const NON_RECORDING_SPAN_FIELD = Symbol.for('sentry.nonRecordingSpan');

/**
 * A Sentry Span that is non-recording, meaning it will not be sent to Sentry.
 */
export class SentryNonRecordingSpan implements Span {
  private _traceId: string;
  private _spanId: string;

  /**
   * Reason why this span was dropped, if applicable ('ignored' or 'sample_rate').
   * Used to propagate the correct client report outcome to descendant spans
   * when span streaming is enabled.
   */
  public dropReason?: EventDropReason;

  public constructor(spanContext: SentryNonRecordingSpanArguments = {}) {
    this._traceId = spanContext.traceId || generateTraceId();
    this._spanId = spanContext.spanId || generateSpanId();
    this.dropReason = spanContext.dropReason;
    addNonEnumerableProperty(this, NON_RECORDING_SPAN_FIELD, true);
  }

  /** @inheritdoc */
  public spanContext(): SpanContextData {
    return {
      spanId: this._spanId,
      traceId: this._traceId,
      traceFlags: TRACE_FLAG_NONE,
    };
  }

  /** @inheritdoc */
  public end(_timestamp?: SpanTimeInput): void {}

  /** @inheritdoc */
  public setAttribute(_key: string, _value: SpanAttributeValue | undefined): this {
    return this;
  }

  /** @inheritdoc */
  public setAttributes(_values: SpanAttributes): this {
    return this;
  }

  /** @inheritdoc */
  public setStatus(_status: SpanStatus): this {
    return this;
  }

  /** @inheritdoc */
  public updateName(_name: string): this {
    return this;
  }

  /** @inheritdoc */
  public isRecording(): boolean {
    return false;
  }

  /** @inheritdoc */
  public addEvent(
    _name: string,
    _attributesOrStartTime?: SpanAttributes | SpanTimeInput,
    _startTime?: SpanTimeInput,
  ): this {
    return this;
  }

  /** @inheritDoc */
  public addLink(_link: unknown): this {
    return this;
  }

  /** @inheritDoc */
  public addLinks(_links: unknown[]): this {
    return this;
  }

  /**
   * This should generally not be used,
   * but we need it for being compliant with the OTEL Span interface.
   *
   * @hidden
   * @internal
   */
  public recordException(_exception: unknown, _time?: SpanTimeInput | undefined): void {
    // noop
  }
}

/**
 * Whether the given span is a {@link SentryNonRecordingSpan}.
 */
export function spanIsNonRecordingSpan(span: Span | undefined): span is SentryNonRecordingSpan {
  return !!span && (span as { [NON_RECORDING_SPAN_FIELD]?: boolean })[NON_RECORDING_SPAN_FIELD] === true;
}
