import { Span as SpanInterface } from '@sentry/types';
import * as opentracing from 'opentracing';
import { SpanContext } from './spancontext';
import { Tracer } from './tracer';

/**
 * Interface for log entries.
 */
interface Log {
  data: { [key: string]: any };
  timestamp?: number;
}

/**
 * Span represents a logical unit of work as part of a broader Trace. Examples
 * of span might include remote procedure calls or a in-process function calls
 * to sub-components. A Trace has a single, top-level "root" Span that in turn
 * may have zero or more child Spans, which in turn may have children.
 */
export class Span extends opentracing.Span implements SpanInterface {
  private _flushed: boolean = false;
  private _finishTime: number = 0;

  private readonly _logs: Log[] = [];

  public tags: {
    [key: string]: string;
  } = {};

  public baggage: {
    [key: string]: string;
  } = {};

  public constructor(
    private readonly _usedTracer: Tracer,
    private _operation: string,
    private readonly _spanContext: SpanContext,
    private readonly _references?: opentracing.Reference[],
    private readonly _startTime: number = Date.now(),
  ) {
    super();
  }

  /**
   * Returns the context.
   */
  protected _context(): SpanContext {
    return this._spanContext;
  }

  /**
   * Returns the tracer passed to the span.
   */
  protected _tracer(): Tracer {
    return this._usedTracer;
  }

  /**
   * Sets the operation name.
   */
  protected _setOperationName(name: string): void {
    this._operation = name;
  }

  /**
   * Implementation for {@link setBaggageItem}
   */
  protected _setBaggageItem(key: string, value: string): void {
    this.baggage[key] = value;
  }

  /**
   * Implementation for {@link getBaggageItem}
   */
  protected _getBaggageItem(key: string): string | undefined {
    return this.baggage[key];
  }

  /**
   * Adds tags { [key: string]: string } to the span
   */
  protected _addTags(set: { [key: string]: string }): void {
    const keys = Object.keys(set);
    for (const key of keys) {
      this.tags[key] = set[key];
    }
  }

  /**
   * Store log entry.
   */
  protected _log(data: { [key: string]: any }, timestamp: number = Date.now() / 1000): void {
    this._logs.push({
      data,
      timestamp,
    });
  }

  /**
   * Implementation for {@link finish}
   */
  protected _finish(finishTime: number = Date.now()): void {
    this._finishTime = finishTime;
  }

  /**
   * Returns the operationName.
   */
  public getOperationName(): string {
    return this._operation;
  }

  /**
   * Returns the duration of the span.
   */
  public duration(): number {
    return this._finishTime - this._startTime;
  }

  /**
   * Returns wether the span has been finished.
   */
  public isFinished(): boolean {
    return this._finishTime > 0;
  }

  /**
   * Marks the span as flushed.
   */
  public flush(): this {
    this._flushed = true;
    return this;
  }

  /**
   * Returns wether the span has already be flushed.
   */
  public isFlushed(): boolean {
    return this._flushed;
  }

  /**
   * @inheritdoc
   */
  public toJSON(): object {
    return {
      finish_time: (this._finishTime && this._finishTime / 1000) || undefined,
      logs: this._logs.length === 0 ? undefined : this._logs,
      operation: this._operation,
      references: this._references && this._references,
      span_id: this._spanContext.spanId,
      start_time: this._startTime / 1000,
      tags: Object.keys(this.tags).length === 0 ? undefined : this.tags,
      trace_id: this._spanContext.traceId,
    };
  }
}
