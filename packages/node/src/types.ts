import type { Span as WriteableSpan } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ClientOptions, Options, SamplingContext, Scope, Span, TracePropagationTargets } from '@sentry/types';

import type { NodeTransportOptions } from './transports';

export interface BaseNodeOptions {
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
   * If this is set to true, the SDK will not set up OpenTelemetry automatically.
   * In this case, you _have_ to ensure to set it up correctly yourself, including:
   * * The `SentrySpanProcessor`
   * * The `SentryPropagator`
   * * The `SentryContextManager`
   * * The `SentrySampler`
   */
  skipOpenTelemetrySetup?: boolean;

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

export interface CurrentScopes {
  scope: Scope;
  isolationScope: Scope;
}

/**
 * The base `Span` type is basically a `WriteableSpan`.
 * There are places where we basically want to allow passing _any_ span,
 * so in these cases we type this as `AbstractSpan` which could be either a regular `Span` or a `ReadableSpan`.
 * You'll have to make sur to check revelant fields before accessing them.
 *
 * Note that technically, the `Span` exported from `@opentelemwetry/sdk-trace-base` matches this,
 * but we cannot be 100% sure that we are actually getting such a span, so this type is more defensive.
 */
export type AbstractSpan = WriteableSpan | ReadableSpan | Span;
