import type { ClientOptions, Options, SamplingContext } from '@sentry/types';

import type { NodeTransportOptions } from './transports';

export interface BaseNodeOptions {
  /**
   * Sets profiling sample rate when @sentry/profiling-node is installed
   */
  profilesSampleRate?: number;

  /**
   * Function to compute profiling sample rate dynamically and filter unwanted profiles.
   *
   * Profiling is enabled if either this or `profilesSampleRate` is defined. If both are defined, `profilesSampleRate` is
   * ignored.
   *
   * Will automatically be passed a context object of default and optional custom data. See
   * {@link Transaction.samplingContext} and {@link Hub.startTransaction}.
   *
   * @returns A sample rate between 0 and 1 (0 drops the profile, 1 guarantees it will be sent). Returning `true` is
   * equivalent to returning 1 and returning `false` is equivalent to returning 0.
   */
  profilesSampler?: (samplingContext: SamplingContext) => number | boolean;

  /** Sets an optional server name (device name) */
  serverName?: string;

  /**
   * Include local variables with stack traces.
   *
   * Requires the `LocalVariables` integration.
   */
  includeLocalVariables?: boolean;

  // TODO (v8): Remove this in v8
  /**
   * @deprecated Moved to constructor options of the `Http` and `Undici` integration.
   * @example
   * ```js
   * Sentry.init({
   *   integrations: [
   *     new Sentry.Integrations.Http({
   *       tracing: {
   *         shouldCreateSpanForRequest: (url: string) => false,
   *       }
   *     });
   *   ],
   * });
   * ```
   */
  shouldCreateSpanForRequest?(this: void, url: string): boolean;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(this: void, error: Error): void;
}

/**
 * Configuration options for the Sentry Node SDK
 * @see @sentry/types Options for more information.
 */
export interface NodeOptions extends Options<NodeTransportOptions>, BaseNodeOptions {}

/**
 * Configuration options for the Sentry Node SDK Client class
 * @see NodeClient for more information.
 */
export interface NodeClientOptions extends ClientOptions<NodeTransportOptions>, BaseNodeOptions {}
