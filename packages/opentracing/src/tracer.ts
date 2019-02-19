import { getCurrentHub } from '@sentry/hub';
import * as opentracing from 'opentracing';
import { Span } from './span';
import { SpanContext } from './spancontext';

/**
 * JSDoc
 */
export class Tracer extends opentracing.Tracer {
  private traceId?: string = undefined;
  private spans: Span[] = [];

  /**
   * Called by public method startSpan
   * @param name Name of the operation
   * @param fields Options for the span {@link opentracing.SpanOptions}
   */
  protected _startSpan(name: string, fields: opentracing.SpanOptions): Span {
    const span = new Span(this, name, new SpanContext(this.traceId), fields.references, fields.startTime);
    this.spans.push(span);
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
    this.traceId = traceId;
  }

  /**
   * Flushes all spans and sends an event
   */
  public flush(): void {
    getCurrentHub().captureEvent({ spans: [...this.spans] });
    this.spans = [];
  }
}
