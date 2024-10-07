import type { ClientOptions, Options, TracePropagationTargets } from '@sentry/types';

import type { VercelEdgeClient } from './client';
import type { VercelEdgeTransportOptions } from './transports';

export interface BaseVercelEdgeOptions {
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
   * Specify a custom VercelEdgeClient to be used. Must extend VercelEdgeClient!
   * This is not a public, supported API, but used internally only.
   *
   * @hidden
   *  */
  clientClass?: typeof VercelEdgeClient;

  /**
   * If this is set to true, the SDK will not set up OpenTelemetry automatically.
   * In this case, you _have_ to ensure to set it up correctly yourself, including:
   * * The `SentrySpanProcessor`
   * * The `SentryPropagator`
   * * The `SentryContextManager`
   * * The `SentrySampler`
   */
  skipOpenTelemetrySetup?: boolean;

  /**
   * The max. duration in seconds that the SDK will wait for parent spans to be finished before discarding a span.
   * The SDK will automatically clean up spans that have no finished parent after this duration.
   * This is necessary to prevent memory leaks in case of parent spans that are never finished or otherwise dropped/missing.
   * However, if you have very long-running spans in your application, a shorter duration might cause spans to be discarded too early.
   * In this case, you can increase this duration to a value that fits your expected data.
   *
   * Defaults to 300 seconds (5 minutes).
   */
  maxSpanWaitDuration?: number;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(this: void, error: Error): void;
}

/**
 * Configuration options for the Sentry VercelEdge SDK
 * @see @sentry/types Options for more information.
 */
export interface VercelEdgeOptions extends Options<VercelEdgeTransportOptions>, BaseVercelEdgeOptions {}

/**
 * Configuration options for the Sentry VercelEdge SDK Client class
 * @see VercelEdgeClient for more information.
 */
export interface VercelEdgeClientOptions extends ClientOptions<VercelEdgeTransportOptions>, BaseVercelEdgeOptions {}
