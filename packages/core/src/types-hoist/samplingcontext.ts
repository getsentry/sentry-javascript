import type { RequestEventData } from '../types-hoist/request';
import type { WorkerLocation } from './misc';
import type { SpanAttributes } from './span';

/**
 * Context data passed by the user when starting a transaction, to be used by the tracesSampler method.
 */
export interface CustomSamplingContext {
  [key: string]: any;
}

/**
 * Data passed to the `tracesSampler` function, which forms the basis for whatever decisions it might make.
 *
 * Adds default data to data provided by the user.
 */
export interface SamplingContext extends CustomSamplingContext {
  /**
   * Sampling decision from the parent transaction, if any.
   */
  parentSampled?: boolean;

  /**
   * Sample rate that is coming from an incoming trace (if there is one).
   */
  parentSampleRate?: number;

  /**
   * Object representing the URL of the current page or worker script. Passed by default when using the `BrowserTracing`
   * integration.
   */
  location?: WorkerLocation;

  /**
   * Object representing the incoming request to a node server in a normalized format.
   */
  normalizedRequest?: RequestEventData;

  /** The name of the span being sampled. */
  name: string;

  /** Initial attributes that have been passed to the span being sampled. */
  attributes?: SpanAttributes;

  /**
   * Returns a sample rate value that matches the sampling decision from the incoming trace, or falls back to the provided `fallbackSampleRate`.
   */
  inheritOrSampleWith: (fallbackSampleRate: number) => number;
}
