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
   * By default, the SDK will try to identify problems with your instrumentation setup and warn you about it.
   * If you want to disable these warnings, set this to `true`.
   */
  disableInstrumentationWarnings?: boolean;

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
   * The max. duration in seconds that the SDK will wait for parent spans to be finished before discarding a span.
   * The SDK will automatically clean up spans that have no finished parent after this duration.
   * This is necessary to prevent memory leaks in case of parent spans that are never finished or otherwise dropped/missing.
   * However, if you have very long-running spans in your application, a shorter duration might cause spans to be discarded too early.
   * In this case, you can increase this duration to a value that fits your expected data.
   *
   * Defaults to 300 seconds (5 minutes).
   */
  maxSpanWaitDuration?: number;

  /**
   * Callback that is executed when a fatal global error occurs.
   */
  onFatalError?(this: void, error: Error): void;
}
