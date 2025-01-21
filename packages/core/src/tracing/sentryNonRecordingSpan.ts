import type {
  DynamicSamplingContext,
  SentrySpanArguments,
  Span,
  SpanAttributeValue,
  SpanAttributes,
  SpanContextData,
  SpanStatus,
  SpanTimeInput,
} from '../types-hoist';
import type { TraceState } from '../types-hoist/span';
import { dynamicSamplingContextToSentryBaggageHeader } from '../utils-hoist';
import { generateSpanId, generateTraceId } from '../utils-hoist/propagationContext';
import { TRACE_FLAG_NONE, generateTraceState } from '../utils/spanUtils';

/**
 * A Sentry Span that is non-recording, meaning it will not be sent to Sentry.
 */
export class SentryNonRecordingSpan implements Span {
  private _traceId: string;
  private _spanId: string;
  private _traceState?: TraceState;

  public constructor(
    spanContext: SentrySpanArguments = {},
    additionalSpanContext?: { dsc?: Partial<DynamicSamplingContext> },
  ) {
    this._traceId = spanContext.traceId || generateTraceId();
    this._spanId = spanContext.spanId || generateSpanId();

    const dsc = additionalSpanContext?.dsc;
    if (dsc) {
      const traceState = generateTraceState().set(
        'sentry.dsc',
        dynamicSamplingContextToSentryBaggageHeader({
          trace_id: this._traceId,
          sampled: 'false',
          sample_rate: '0',
          ...dsc,
        }),
      );
      this._traceState = traceState;
    }
  }

  /** @inheritdoc */
  public spanContext(): SpanContextData {
    return {
      spanId: this._spanId,
      traceId: this._traceId,
      traceFlags: TRACE_FLAG_NONE,
      traceState: this._traceState,
    };
  }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
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

  /**
   * This should generally not be used,
   * but we need it for being compliant with the OTEL Span interface.
   *
   * @hidden
   * @internal
   */
  public addLink(_link: unknown): this {
    return this;
  }

  /**
   * This should generally not be used,
   * but we need it for being compliant with the OTEL Span interface.
   *
   * @hidden
   * @internal
   */
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
  public recordException(_exception: unknown, _time?: number | undefined): void {
    // noop
  }
}
