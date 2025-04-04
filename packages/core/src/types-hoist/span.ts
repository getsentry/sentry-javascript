import type { SpanLink, SpanLinkJSON } from './link';
import type { Measurements } from './measurement';
import type { HrTime } from './opentelemetry';
import type { SpanStatus } from './spanStatus';
import type { TransactionSource } from './transaction';

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

export type SpanAttributes = Partial<{
  'sentry.origin': string;
  'sentry.op': string;
  'sentry.source': TransactionSource;
  'sentry.sample_rate': number;
}> &
  Record<string, SpanAttributeValue | undefined>;

/** This type is aligned with the OpenTelemetry TimeInput type. */
export type SpanTimeInput = HrTime | number | Date;

/** A JSON representation of a span. */
export interface SpanJSON {
  data: SpanAttributes;
  description?: string;
  op?: string;
  parent_span_id?: string;
  span_id: string;
  start_timestamp: number;
  status?: string;
  timestamp?: number;
  trace_id: string;
  origin?: SpanOrigin;
  profile_id?: string;
  exclusive_time?: number;
  measurements?: Measurements;
  is_segment?: boolean;
  segment_id?: string;
  links?: SpanLinkJSON[];
}

// These are aligned with OpenTelemetry trace flags
type TraceFlagNone = 0;
type TraceFlagSampled = 1;
export type TraceFlag = TraceFlagNone | TraceFlagSampled;

export interface TraceState {
  /**
   * Create a new TraceState which inherits from this TraceState and has the
   * given key set.
   * The new entry will always be added in the front of the list of states.
   *
   * @param key key of the TraceState entry.
   * @param value value of the TraceState entry.
   */
  set(key: string, value: string): TraceState;
  /**
   * Return a new TraceState which inherits from this TraceState but does not
   * contain the given key.
   *
   * @param key the key for the TraceState entry to be removed.
   */
  unset(key: string): TraceState;
  /**
   * Returns the value to which the specified key is mapped, or `undefined` if
   * this map contains no mapping for the key.
   *
   * @param key with which the specified value is to be associated.
   * @returns the value to which the specified key is mapped, or `undefined` if
   *     this map contains no mapping for the key.
   */
  get(key: string): string | undefined;
  /**
   * Serializes the TraceState to a `list` as defined below. The `list` is a
   * series of `list-members` separated by commas `,`, and a list-member is a
   * key/value pair separated by an equals sign `=`. Spaces and horizontal tabs
   * surrounding `list-members` are ignored. There can be a maximum of 32
   * `list-members` in a `list`.
   *
   * @returns the serialized string.
   */
  serialize(): string;
}

export interface SpanContextData {
  /**
   * The ID of the trace that this span belongs to. It is worldwide unique
   * with practically sufficient probability by being made as 16 randomly
   * generated bytes, encoded as a 32 lowercase hex characters corresponding to
   * 128 bits.
   */
  traceId: string;

  /**
   * The ID of the Span. It is globally unique with practically sufficient
   * probability by being made as 8 randomly generated bytes, encoded as a 16
   * lowercase hex characters corresponding to 64 bits.
   */
  spanId: string;

  /**
   * Only true if the SentrySpanArguments was propagated from a remote parent.
   */
  isRemote?: boolean | undefined;

  /**
   * Trace flags to propagate.
   *
   * It is represented as 1 byte (bitmap). Bit to represent whether trace is
   * sampled or not. When set, the least significant bit documents that the
   * caller may have recorded trace data. A caller who does not record trace
   * data out-of-band leaves this flag unset.
   */
  traceFlags: TraceFlag | number;

  /** In OpenTelemetry, this can be used to store trace state, which are basically key-value pairs. */
  traceState?: TraceState | undefined;
}

/**
 * Interface holding all properties that can be set on a Span on creation.
 * This is only used for the legacy span/transaction creation and will go away in v8.
 */
export interface SentrySpanArguments {
  /**
   * Human-readable identifier for the span.
   */
  name?: string | undefined;

  /**
   * Operation of the Span.
   */
  op?: string | undefined;

  /**
   * Parent Span ID
   */
  parentSpanId?: string | undefined;

  /**
   * Was this span chosen to be sent as part of the sample?
   */
  sampled?: boolean | undefined;

  /**
   * Span ID
   */
  spanId?: string | undefined;

  /**
   * Trace ID
   */
  traceId?: string | undefined;

  /**
   * Attributes of the Span.
   */
  attributes?: SpanAttributes;

  /**
   * Timestamp in seconds (epoch time) indicating when the span started.
   */
  startTimestamp?: number | undefined;

  /**
   * Timestamp in seconds (epoch time) indicating when the span ended.
   */
  endTimestamp?: number | undefined;

  /**
   * Links to associate with the new span. Setting links here is preferred over addLink()
   * as certain context information is only available during span creation.
   */
  links?: SpanLink[];

  /**
   * Set to `true` if this span should be sent as a standalone segment span
   * as opposed to a transaction.
   *
   * @experimental this option is currently experimental and should only be
   * used within SDK code. It might be removed or changed in the future.
   */
  isStandalone?: boolean | undefined;
}

/**
 * A generic Span which holds trace data.
 */
export interface Span {
  /**
   * Get context data for this span.
   * This includes the spanId & the traceId.
   */
  spanContext(): SpanContextData;

  /**
   * End the current span.
   */
  end(endTimestamp?: SpanTimeInput): void;

  /**
   * Set a single attribute on the span.
   * Set it to `undefined` to remove the attribute.
   */
  setAttribute(key: string, value: SpanAttributeValue | undefined): this;

  /**
   * Set multiple attributes on the span.
   * Any attribute set to `undefined` will be removed.
   */
  setAttributes(attributes: SpanAttributes): this;

  /**
   * Sets the status attribute on the current span.
   */
  setStatus(status: SpanStatus): this;

  /**
   * Update the name of the span.
   *
   * **Important:** You most likely want to use `Sentry.updateSpanName(span, name)` instead!
   *
   * This method will update the current span name but cannot guarantee that the new name will be
   * the final name of the span. Instrumentation might still overwrite the name with an automatically
   * computed name, for example in `http.server` or `db` spans.
   *
   * You can ensure that your name is kept and not overwritten by calling `Sentry.updateSpanName(span, name)`
   *
   * @param name the new name of the span
   */
  updateName(name: string): this;

  /**
   * If this is span is actually recording data.
   * This will return false if tracing is disabled, this span was not sampled or if the span is already finished.
   */
  isRecording(): boolean;

  /**
   * Adds an event to the Span.
   */
  addEvent(name: string, attributesOrStartTime?: SpanAttributes | SpanTimeInput, startTime?: SpanTimeInput): this;

  /**
   * Associates this span with a related span. Links can reference spans from the same or different trace
   * and are typically used for batch operations, cross-trace scenarios, or scatter/gather patterns.
   *
   * Prefer setting links directly when starting a span (e.g. `Sentry.startSpan()`) as some context information is only available during span creation.
   * @param link - The link containing the context of the span to link to and optional attributes
   */
  addLink(link: SpanLink): this;

  /**
   * Associates this span with multiple related spans. See {@link addLink} for more details.
   *
   * Prefer setting links directly when starting a span (e.g. `Sentry.startSpan()`) as some context information is only available during span creation.
   * @param links - Array of links to associate with this span
   */
  addLinks(links: SpanLink[]): this;

  /**
   * NOT USED IN SENTRY, only added for compliance with OTEL Span interface
   */
  recordException(exception: unknown, time?: number): void;
}
