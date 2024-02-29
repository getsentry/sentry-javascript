import type { ClientOptions, Options, TracePropagationTargets } from '@sentry/types';

import type { DenoTransportOptions } from './transports';

export interface BaseDenoOptions {
  /**
   * List of strings/regex controlling to which outgoing requests
   * the SDK will attach tracing headers.
   *
   * By default the SDK will attach those headers to all outgoing
   * requests. If this option is provided, the SDK will match the
   * request URL of outgoing requests against the items in this
   * array, and only attach tracing headers if a match was found.
   *
   * @example
   * ```js
   * Sentry.init({
   *   tracePropagationTargets: ['api.site.com'],
   * });
   * ```
   */
  tracePropagationTargets?: TracePropagationTargets;

  /** Sets an optional server name (device name) */
  serverName?: string;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(this: void, error: Error): void;
}

/**
 * Configuration options for the Sentry Deno SDK
 * @see @sentry/types Options for more information.
 */
export interface DenoOptions extends Options<DenoTransportOptions>, BaseDenoOptions {}

/**
 * Configuration options for the Sentry Deno SDK Client class
 * @see DenoClient for more information.
 */
export interface DenoClientOptions extends ClientOptions<DenoTransportOptions>, BaseDenoOptions {}
