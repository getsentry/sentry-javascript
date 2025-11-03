import type { BaseTransportOptions, ClientOptions, Options, TracePropagationTargets } from '@sentry/core';

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
   * If this is set to true, the SDK will not set up OpenTelemetry automatically.
   * In this case, you _have_ to ensure to set it up correctly yourself, including:
   * * The `SentrySpanProcessor`
   * * The `SentryPropagator`
   * * The `SentryContextManager`
   * * The `SentrySampler`
   *
   * If you are registering your own OpenTelemetry Loader Hooks (or `import-in-the-middle` hooks), it is also recommended to set the `registerEsmLoaderHooks` option to false.
   */
  skipOpenTelemetrySetup?: boolean;

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(this: void, error: Error): void;
}

/**
 * Configuration options for the Sentry Bun SDK
 * @see @sentry/core Options for more information.
 */
export interface BunOptions extends Options<BaseTransportOptions>, BaseBunOptions {}

/**
 * Configuration options for the Sentry Bun SDK Client class
 * @see BunClient for more information.
 */
export interface BunClientOptions extends ClientOptions<BaseTransportOptions>, BaseBunOptions {}
