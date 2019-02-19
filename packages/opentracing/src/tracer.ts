import { SpanOptions, Tracer as otTracer } from 'opentracing/lib/tracer';
import { Span } from './span';
import { SpanContext } from './spancontext';

/**
 * JSDoc
 */
export class Tracer extends otTracer {
  private readonly spans: Span[] = [];

  /**
   * Called by public method startSpan
   * @param name Name of the operation
   * @param fields Options for the span {@link opentracing.SpanOptions}
   */
  protected _startSpan(name: string, fields: SpanOptions): Span {
    // TODO: Traceid
    const span = new Span(this, name, new SpanContext('1'), fields.startTime);
    this.spans.push(span);
    // TODO: Implement childof
    return span;
  }

  /**
   * @inheritdoc
   */
  public startSpan(name: string, options: SpanOptions = {}): Span {
    return (super.startSpan(name, options) as unknown) as Span;
  }
}
