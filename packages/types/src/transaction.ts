import type { ExtractedNodeRequestData, WorkerLocation } from './misc';
import type { SpanAttributes } from './span';

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
   * Context data with which transaction being sampled was created.
   * @deprecated This is duplicate data and will be removed eventually.
   */
  transactionContext: {
    name: string;
    parentSampled?: boolean | undefined;
  };

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

  /** The name of the span being sampled. */
  name: string;

  /** Initial attributes that have been passed to the span being sampled. */
  attributes?: SpanAttributes;
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
