import type { TraceContext } from './context';
import type { Instrumenter } from './instrumenter';
import type { Primitive } from './misc';
import type { Transaction } from './transaction';

type SpanOriginType = 'manual' | 'auto';
type SpanOriginCategory = string; // e.g. http, db, ui, ....
type SpanOriginIntegrationName = string;
type SpanOriginIntegrationPart = string;
export type SpanOrigin =
  | SpanOriginType
  | `${SpanOriginType}.${SpanOriginCategory}`
  | `${SpanOriginType}.${SpanOriginCategory}.${SpanOriginIntegrationName}`
  | `${SpanOriginType}.${SpanOriginCategory}.${SpanOriginIntegrationName}.${SpanOriginIntegrationPart}`;

// These types are aligned with OpenTelemetry Span Attributes
export type SpanAttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>;

export type SpanAttributes = Record<string, SpanAttributeValue | undefined>;

/** Interface holding all properties that can be set on a Span on creation. */
export interface SpanContext {
  /**
   * Description of the Span.
   */
  description?: string;

  /**
   * Human-readable identifier for the span. Alias for span.description.
   */
  name?: string;

  /**
   * Operation of the Span.
   */
  op?: string;

  /**
   * Completion status of the Span.
   * See: {@sentry/tracing SpanStatus} for possible values
   */
  status?: string;

  /**
   * Parent Span ID
   */
  parentSpanId?: string;

  /**
   * Was this span chosen to be sent as part of the sample?
   */
  sampled?: boolean;

  /**
   * Span ID
   */
  spanId?: string;

  /**
   * Trace ID
   */
  traceId?: string;

  /**
   * Tags of the Span.
   */
  tags?: { [key: string]: Primitive };

  /**
   * Data of the Span.
   */
  data?: { [key: string]: any };

  /**
   * Attributes of the Span.
   */
  attributes?: SpanAttributes;

  /**
   * Timestamp in seconds (epoch time) indicating when the span started.
   */
  startTimestamp?: number;

  /**
   * Timestamp in seconds (epoch time) indicating when the span ended.
   */
  endTimestamp?: number;

  /**
   * The instrumenter that created this span.
   */
  instrumenter?: Instrumenter;

  /**
   * The origin of the span, giving context about what created the span.
   */
  origin?: SpanOrigin;
}

/** Span holding trace_id, span_id */
export interface Span extends SpanContext {
  /**
   * Human-readable identifier for the span. Identical to span.description.
   */
  name: string;

  /**
   * @inheritDoc
   */
  spanId: string;

  /**
   * @inheritDoc
   */
  traceId: string;

  /**
   * @inheritDoc
   */
  startTimestamp: number;

  /**
   * @inheritDoc
   */
  tags: { [key: string]: Primitive };

  /**
   * @inheritDoc
   */
  data: { [key: string]: any };

  /**
   * @inheritDoc
   */
  attributes: SpanAttributes;

  /**
   * The transaction containing this span
   */
  transaction?: Transaction;

  /**
   * The instrumenter that created this span.
   */
  instrumenter: Instrumenter;

  /**
   * Sets the finish timestamp on the current span.
   * @param endTimestamp Takes an endTimestamp if the end should not be the time when you call this function.
   */
  finish(endTimestamp?: number): void;

  /**
   * End the current span.
   */
  end(endTimestamp?: number): void;

  /**
   * Sets the tag attribute on the current span.
   *
   * Can also be used to unset a tag, by passing `undefined`.
   *
   * @param key Tag key
   * @param value Tag value
   */
  setTag(key: string, value: Primitive): this;

  /**
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   */
  setData(key: string, value: any): this;

  /**
   * Set a single attribute on the span.
   * Set it to `undefined` to remove the attribute.
   */
  setAttribute(key: string, value: SpanAttributeValue | undefined): void;

  /**
   * Set multiple attributes on the span.
   * Any attribute set to `undefined` will be removed.
   */
  setAttributes(attributes: SpanAttributes): void;

  /**
   * Sets the status attribute on the current span
   * See: {@sentry/tracing SpanStatus} for possible values
   * @param status http code used to set the status
   */
  setStatus(status: string): this;

  /**
   * Sets the status attribute on the current span based on the http code
   * @param httpStatus http code used to set the status
   */
  setHttpStatus(httpStatus: number): this;

  /**
   * Set the name of the span.
   *
   * @deprecated Use `updateName()` instead.
   */
  setName(name: string): void;

  /**
   * Update the name of the span.
   */
  updateName(name: string): this;

  /**
   * Creates a new `Span` while setting the current `Span.id` as `parentSpanId`.
   * Also the `sampled` decision will be inherited.
   */
  startChild(spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'sampled' | 'traceId' | 'parentSpanId'>>): Span;

  /**
   * Determines whether span was successful (HTTP200)
   */
  isSuccess(): boolean;

  /**
   * Return a traceparent compatible header string.
   * @deprecated Use `spanToTraceHeader()` instead.
   */
  toTraceparent(): string;

  /**
   * Returns the current span properties as a `SpanContext`.
   * @deprecated Use `toJSON()` or access the fields directly instead.
   */
  toContext(): SpanContext;

  /**
   * Updates the current span with a new `SpanContext`.
   * @deprecated Update the fields directly instead.
   */
  updateWithContext(spanContext: SpanContext): this;

  /**
   * Convert the object to JSON for w. spans array info only.
   * @deprecated Use `spanToTraceContext()` util function instead.
   */
  getTraceContext(): TraceContext;

  /** Convert the object to JSON */
  toJSON(): {
    data?: { [key: string]: any };
    description?: string;
    op?: string;
    parent_span_id?: string;
    span_id: string;
    start_timestamp: number;
    status?: string;
    tags?: { [key: string]: Primitive };
    timestamp?: number;
    trace_id: string;
    origin?: SpanOrigin;
  };
}
