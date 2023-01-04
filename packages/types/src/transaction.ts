import type { Context } from './context';
import type { DynamicSamplingContext } from './envelope';
import type { Instrumenter } from './instrumenter';
import type { MeasurementUnit } from './measurement';
import type { ExtractedNodeRequestData, Primitive, WorkerLocation } from './misc';
import type { PolymorphicRequest } from './polymorphics';
import type { Span, SpanContext } from './span';

/**
 * Interface holding Transaction-specific properties
 */
export interface TransactionContext extends SpanContext {
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
  trimEnd?: boolean;

  /**
   * If this transaction has a parent, the parent's sampling decision
   */
  parentSampled?: boolean;

  /**
   * Metadata associated with the transaction, for internal SDK use.
   */
  metadata?: Partial<TransactionMetadata>;
}

/**
 * Data pulled from a `sentry-trace` header
 */
export type TraceparentData = Pick<TransactionContext, 'traceId' | 'parentSpanId' | 'parentSampled'>;

/**
 * Transaction "Class", inherits Span only has `setName`
 */
export interface Transaction extends TransactionContext, Span {
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
   * Metadata about the transaction
   */
  metadata: TransactionMetadata;

  /**
   * The instrumenter that created this transaction.
   */
  instrumenter: Instrumenter;

  /**
   * Set the name of the transaction
   */
  setName(name: string, source?: TransactionMetadata['source']): void;

  /**
   * Set the context of a transaction event
   */
  setContext(key: string, context: Context): void;

  /**
   * Set observed measurement for this transaction.
   *
   * @param name Name of the measurement
   * @param value Value of the measurement
   * @param unit Unit of the measurement. (Defaults to an empty string)
   */
  setMeasurement(name: string, value: number, unit: MeasurementUnit): void;

  /** Returns the current transaction properties as a `TransactionContext` */
  toContext(): TransactionContext;

  /** Updates the current transaction with a new `TransactionContext` */
  updateWithContext(transactionContext: TransactionContext): this;

  /**
   * Set metadata for this transaction.
   * @hidden
   */
  setMetadata(newMetadata: Partial<TransactionMetadata>): void;

  /** Return the current Dynamic Sampling Context of this transaction */
  getDynamicSamplingContext(): Partial<DynamicSamplingContext>;
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
  transactionContext: TransactionContext;

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
  /** The sample rate used when sampling this transaction */
  sampleRate?: number;

  /**
   * The Dynamic Sampling Context of a transaction. If provided during transaction creation, its Dynamic Sampling
   * Context Will be frozen
   */
  dynamicSamplingContext?: Partial<DynamicSamplingContext>;

  /** For transactions tracing server-side request handling, the request being tracked. */
  request?: PolymorphicRequest;

  /** Compatibility shim for transitioning to the `RequestData` integration. The options passed to our Express request
   * handler controlling what request data is added to the event.
   * TODO (v8): This should go away
   */
  requestDataOptionsFromExpressHandler?: { [key: string]: unknown };

  /** For transactions tracing server-side request handling, the path of the request being tracked. */
  /** TODO: If we rm -rf `instrumentServer`, this can go, too */
  requestPath?: string;

  /** Information on how a transaction name was generated. */
  source: TransactionSource;

  /** Metadata for the transaction's spans, keyed by spanId */
  spanMetadata: { [spanId: string]: { [key: string]: unknown } };

  /** Metadata representing information about transaction name changes  */
  changes: TransactionNameChange[];

  /** The total number of propagations that happened */
  propagations: number;
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

/**
 * Object representing metadata about when a transaction name was changed.
 */
export interface TransactionNameChange {
  /**
   * Unix timestamp when the name was changed. Same type as the start and
   * end timestamps of a transaction and span.
   */
  timestamp: number;

  /** Previous source before transaction name change */
  source: TransactionSource;

  /** Number of propagations since start of transaction */
  propagations: number;
}
