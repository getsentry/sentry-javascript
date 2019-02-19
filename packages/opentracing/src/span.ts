import { Span as SpanInterface } from '@sentry/types';
import * as opentracing from 'opentracing';
import { SpanContext } from './spancontext';
import { Tracer } from './tracer';

/** JSDoc */
interface Log {
  keyValuePairs: { [key: string]: any };
  timestamp?: number;
}

/** JSDoc */
export class Span extends opentracing.Span implements SpanInterface {
  private finishTime: number = 0;

  private readonly logs: Log[] = [];

  public tags: {
    [key: string]: string;
  } = {};

  public baggage: {
    [key: string]: string;
  } = {};

  public constructor(
    private readonly usedTracer: Tracer,
    private operation: string,
    private readonly spanContext: SpanContext,
    private readonly references?: opentracing.Reference[],
    private readonly startTime: number = Date.now(),
  ) {
    super();
  }

  /**
   * Returns the context.
   */
  protected _context(): SpanContext {
    return this.spanContext;
  }

  /**
   * Returns the tracer passed to the span.
   */
  protected _tracer(): Tracer {
    return this.usedTracer;
  }

  /**
   * Sets the operation name.
   */
  protected _setOperationName(name: string): void {
    this.operation = name;
  }

  /** JSDoc */
  protected _setBaggageItem(key: string, value: string): void {
    this.baggage[key] = value;
  }

  /** JSDoc */
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
  protected _log(keyValuePairs: { [key: string]: any }, timestamp?: number): void {
    this.logs.push({
      keyValuePairs,
      timestamp,
    });
  }

  /**
   * JSDoc
   */
  protected _finish(finishTime?: number): void {
    this.finishTime = finishTime || Date.now();
  }

  /**
   * Returns the operationName.
   */
  public getOperationName(): string {
    return this.operation;
  }

  /**
   * Returns the duration of the span.
   */
  public duration(): number {
    return this.finishTime - this.startTime;
  }

  /**
   * @inheritdoc
   */
  public toJSON(): object {
    return {
      finishTime: this.finishTime || undefined,
      logs: this.logs,
      references: this.references,
      span_id: this.spanContext.spanId,
      startTime: this.startTime,
      tags: this.tags,
      trace_id: this.spanContext.traceId,
    };
  }
}
