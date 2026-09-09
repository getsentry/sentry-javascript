import type { TracePropagationTargets } from '@sentry/core';

/**
 * Base options for WinterTC-compatible server-side JavaScript runtimes.
 * This interface contains common configuration options shared between
 * SDKs.
 */
export interface ServerRuntimeOptions {
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

  /**
   * Sets an optional server name (device name).
   *
   * This is useful for identifying which server or instance is sending events.
   */
  serverName?: string;

  /**
   * If you use Spotlight by Sentry during development, use
   * this option to forward captured Sentry events to Spotlight.
   *
   * Either set it to true, or provide a specific Spotlight Sidecar URL.
   *
   * More details: https://spotlightjs.com/
   *
   * IMPORTANT: Only set this option to `true` while developing, not in production!
   */
  spotlight?: boolean | string;

  /**
   * If set to `false`, the SDK will not automatically detect the `serverName`.
   *
   * This is useful if you are using the SDK in a CLI app or Electron where the
   * hostname might be considered PII.
   *
   * @default true
   */
  includeServerName?: boolean;

  /**
   * Controls how many milliseconds to wait before shutting down. The default is 2 seconds. Setting this too low can cause
   * problems for sending events from command line applications. Setting it too
   * high can cause the application to block for users with network connectivity
   * problems.
   */
  shutdownTimeout?: number;

  /**
   * Configures in which interval client reports will be flushed. Defaults to `60_000` (milliseconds).
   */
  clientReportFlushInterval?: number;

  /**
   * Callback that is executed when a fatal global error occurs.
   */
  onFatalError?(this: void, error: Error): void;
}
