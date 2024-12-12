import type { ClientOptions, Options, TracePropagationTargets } from '@sentry/core';

import type { BunClient } from './client';
import type { BunTransportOptions } from './transports';

export interface BaseBunOptions {
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

  /**
   * Specify a custom BunClient to be used. Must extend BunClient!
   * This is not a public, supported API, but used internally only.
   *
   * @hidden
   *  */
  clientClass?: typeof BunClient;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(this: void, error: Error): void;
}

/**
 * Configuration options for the Sentry Bun SDK
 * @see @sentry/core Options for more information.
 */
export interface BunOptions extends Options<BunTransportOptions>, BaseBunOptions {}

/**
 * Configuration options for the Sentry Bun SDK Client class
 * @see BunClient for more information.
 */
export interface BunClientOptions extends ClientOptions<BunTransportOptions>, BaseBunOptions {}
