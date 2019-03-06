import { getCurrentHub } from '@sentry/hub';
import * as opentracing from 'opentracing';
import { Span } from './span';
import { SpanContext } from './spancontext';

/**
 * Tracer is the entry-point between the instrumentation API and the tracing
 * implementation.
 *
 * The default object acts as a no-op implementation.
 *
 * Note to implementators: derived classes can choose to directly implement the
 * methods in the "OpenTracing API methods" section, or optionally the subset of
 * underscore-prefixed methods to pick up the argument checking and handling
 * automatically from the base class.
 */
export class Tracer extends opentracing.Tracer {
  private _traceId?: string = undefined;
  private readonly _spans: Span[] = [];

  /**
   * Called by public method startSpan
   * @param name Name of the operation
   * @param fields Options for the span {@link opentracing.SpanOptions}
   */
  protected _startSpan(name: string, fields: opentracing.SpanOptions): Span {
    const span = new Span(this, name, new SpanContext(this._traceId), fields.references, fields.startTime);
    this._spans.push(span);
    return span;
  }

  /**
   * @inheritdoc
   */
  public startSpan(name: string, options: opentracing.SpanOptions = {}): Span {
    return (super.startSpan(name, options) as unknown) as Span;
  }

  /**
   * Sets the current traceId, all new created spans will receive the traceId.
   *
   * @param traceId A string representing the traceId
   */
  public setTraceId(traceId?: string): void {
    this._traceId = traceId;
  }

  /**
   * Flushes all spans and sends an event
   */
  public flush(): void {
    const finishedSpans = this._spans.filter((span: Span) => span.isFinished() && !span.isFlushed());
    if (finishedSpans.length) {
      getCurrentHub().captureEvent({
        spans: finishedSpans.map((span: Span) => span.flush()),
        type: 'none', // This ensures a Sentry event will not be created on the server
      });
    }
  }
}
