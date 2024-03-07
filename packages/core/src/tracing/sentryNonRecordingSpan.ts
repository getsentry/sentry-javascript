import type {
  Span,
  SpanAttributeValue,
  SpanAttributes,
  SpanContext,
  SpanContextData,
  SpanStatus,
  SpanTimeInput,
} from '@sentry/types';
import { uuid4 } from '@sentry/utils';
import { TRACE_FLAG_NONE } from '../utils/spanUtils';

/**
 * A Sentry Span that is non-recording, meaning it will not be sent to Sentry.
 */
export class SentryNonRecordingSpan implements Span {
  private _traceId: string;
  private _spanId: string;

  public constructor(spanContext: SpanContext = {}) {
    this._traceId = spanContext.traceId || uuid4();
    this._spanId = spanContext.spanId || uuid4().substring(16);
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
}
