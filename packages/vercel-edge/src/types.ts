import type { ClientOptions, Options, TracePropagationTargets } from '@sentry/core';
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
   * Override the runtime name reported in events.
   * Defaults to 'vercel-edge' if not specified.
   *
   * @hidden This is primarily used internally to support platforms like OpenNext/Cloudflare.
   */
  runtime?: { name: string; version?: string };

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
   * * The `SentryTracerProvider`
   * * The `SentryPropagator`
   */
  skipOpenTelemetrySetup?: boolean;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(this: void, error: Error): void;
}

/**
 * Configuration options for the Sentry VercelEdge SDK
 * @see @sentry/core Options for more information.
 */
export interface VercelEdgeOptions extends Options<VercelEdgeTransportOptions>, BaseVercelEdgeOptions {}

/**
 * Configuration options for the Sentry VercelEdge SDK Client class
 * @see VercelEdgeClient for more information.
 */
export interface VercelEdgeClientOptions extends ClientOptions<VercelEdgeTransportOptions>, BaseVercelEdgeOptions {}
