import type { Context } from './context';
import type { DynamicSamplingContext } from './envelope';
import type { MeasurementUnit } from './measurement';
import type { ExtractedNodeRequestData, WorkerLocation } from './misc';
import type { PolymorphicRequest } from './polymorphics';
import type { SentrySpanArguments, Span, SpanAttributes } from './span';

/**
 * Interface holding Transaction-specific properties
 */
export interface TransactionArguments extends SentrySpanArguments {
  /**
   * Human-readable identifier for the transaction
   */
  name: string;

  /**
   * If true, sets the end timestamp of the transaction to the highest timestamp of child spans, trimming
   * the duration of the transaction. This is useful to discard extra time in the transaction that is not
   * accounted for in child spans, like what happens in the idle transaction Tracing integration, where we finish the
   * transaction after a given "idle time" and we don't want this "idle time" to be part of the transaction.
   */
  trimEnd?: boolean | undefined;

  /**
   * If this transaction has a parent, the parent's sampling decision
   */
  parentSampled?: boolean | undefined;

  /**
   * Metadata associated with the transaction, for internal SDK use.
   * @deprecated Use attributes or store data on the scope instead.
   */
  metadata?: Partial<TransactionMetadata>;
}

/**
 * Data pulled from a `sentry-trace` header
 */
export interface TraceparentData {
  /**
   * Trace ID
   */
  traceId?: string | undefined;

  /**
   * Parent Span ID
   */
  parentSpanId?: string | undefined;

  /**
   * If this transaction has a parent, the parent's sampling decision
   */
  parentSampled?: boolean | undefined;
}

/**
 * Transaction "Class", inherits Span only has `setName`
 */
export interface Transaction extends Omit<TransactionArguments, 'name' | 'op' | 'spanId' | 'traceId'>, Span {
  /**
   * @inheritDoc
   */
  startTimestamp: number;

  /**
   * Attributes for the transaction.
   * @deprecated Use `getSpanAttributes(transaction)` instead.
   */
  attributes: SpanAttributes;

  /**
   * Metadata about the transaction.
   * @deprecated Use attributes or store data on the scope instead.
   */
  metadata: TransactionMetadata;

  /**
   * Set the context of a transaction event.
   * @deprecated Use either `.setAttribute()`, or set the context on the scope before creating the transaction.
   */
  setContext(key: string, context: Context): void;

  /**
   * Set observed measurement for this transaction.
   *
   * @param name Name of the measurement
   * @param value Value of the measurement
   * @param unit Unit of the measurement. (Defaults to an empty string)
   *
   * @deprecated Use top-level `setMeasurement()` instead.
   */
  setMeasurement(name: string, value: number, unit: MeasurementUnit): void;

  /**
   * Returns the current transaction properties as a `TransactionArguments`.
   * @deprecated Use `toJSON()` or access the fields directly instead.
   */
  toContext(): TransactionArguments;

  /**
   * Set metadata for this transaction.
   * @deprecated Use attributes or store data on the scope instead.
   */
  setMetadata(newMetadata: Partial<TransactionMetadata>): void;

  /**
   * Return the current Dynamic Sampling Context of this transaction
   *
   * @deprecated Use top-level `getDynamicSamplingContextFromSpan` instead.
   */
  getDynamicSamplingContext(): Partial<DynamicSamplingContext>;

  /**
   * Creates a new `Span` while setting the current `Span.id` as `parentSpanId`.
   * Also the `sampled` decision will be inherited.
   *
   * @deprecated Use `startSpan()`, `startSpanManual()` or `startInactiveSpan()` instead.
   */
  startChild(
    spanContext?: Pick<SentrySpanArguments, Exclude<keyof SentrySpanArguments, 'sampled' | 'traceId' | 'parentSpanId'>>,
  ): Span;
}

/**
 * Context data passed by the user when starting a transaction, to be used by the tracesSampler method.
 */
export interface CustomSamplingContext {
  [key: string]: any;
}

/**
 * Data passed to the `tracesSampler` function, which forms the basis for whatever decisions it might make.
 *
 * Adds default data to data provided by the user. See {@link Hub.startTransaction}
 */
export interface SamplingContext extends CustomSamplingContext {
  /**
   * Context data with which transaction being sampled was created
   */
  transactionContext: TransactionArguments;

  /**
   * Sampling decision from the parent transaction, if any.
   */
  parentSampled?: boolean;

  /**
   * Object representing the URL of the current page or worker script. Passed by default when using the `BrowserTracing`
   * integration.
   */
  location?: WorkerLocation;

  /**
   * Object representing the incoming request to a node server. Passed by default when using the TracingHandler.
   */
  request?: ExtractedNodeRequestData;
}

export interface TransactionMetadata {
  /**
   * The sample rate used when sampling this transaction.
   * @deprecated Use `SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE` attribute instead.
   */
  sampleRate?: number;

  /**
   * The Dynamic Sampling Context of a transaction. If provided during transaction creation, its Dynamic Sampling
   * Context Will be frozen
   */
  dynamicSamplingContext?: Partial<DynamicSamplingContext>;

  /** For transactions tracing server-side request handling, the request being tracked. */
  request?: PolymorphicRequest;

  /** For transactions tracing server-side request handling, the path of the request being tracked. */
  /** TODO: If we rm -rf `instrumentServer`, this can go, too */
  requestPath?: string;
}

/**
 * Contains information about how the name of the transaction was determined. This will be used by the server to decide
 * whether or not to scrub identifiers from the transaction name, or replace the entire name with a placeholder.
 */
export type TransactionSource =
  /** User-defined name */
  | 'custom'
  /** Raw URL, potentially containing identifiers */
  | 'url'
  /** Parametrized URL / route */
  | 'route'
  /** Name of the view handling the request */
  | 'view'
  /** Named after a software component, such as a function or class name. */
  | 'component'
  /** Name of a background task (e.g. a Celery task) */
  | 'task';
