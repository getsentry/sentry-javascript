import type { NodeTransportOptions } from '@sentry/node';
import type { ClientOptions, Options, TracePropagationTargets } from '@sentry/types';

import type { BunClient } from './client';

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
export interface BunOptions extends Options<NodeTransportOptions>, BaseBunOptions {}

/**
 * Configuration options for the Sentry Node SDK Client class
 * @see BunClient for more information.
 */
export interface BunClientOptions extends ClientOptions<NodeTransportOptions>, BaseBunOptions {}
