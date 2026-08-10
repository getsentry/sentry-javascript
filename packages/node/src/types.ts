import type { ClientOptions, Options, SamplingContext, Scope, ServerRuntimeOptions } from '@sentry/core';
import type { NodeTransportOptions } from './transports';

/**
 * Base options for the Sentry Node SDK.
 */
export interface BaseNodeOptions extends ServerRuntimeOptions {
  /**
   * Controls whether the SDK registers its own Sentry OpenTelemetry tracer provider.
   *
   * When `false` (the default for most SDKs), no tracer provider is set up. The SDK isolates scopes
   * with a native AsyncLocalStorage context strategy and still emits spans via its own
   * instrumentation, but spans created through `@opentelemetry/api` are not captured.
   *
   * When `true`, the SDK registers its own `SentryTracerProvider` (and `SentryPropagator`) as the
   * global OpenTelemetry tracer provider, so spans created through `@opentelemetry/api` become Sentry
   * spans. This is the default for the Next.js and SvelteKit SDKs. If you run your own tracer provider,
   * keep this `false` so the SDK does not register a competing provider; note the SDK no longer feeds
   * spans into a user-owned provider, so those spans stay in your OpenTelemetry pipeline.
   *
   * @default false
   */
  enableOpenTelemetrySetup?: boolean;

  /**
   * Override the runtime name reported in events.
   * Defaults to 'node' with the current process version if not specified.
   *
   * @hidden This is primarily used internally to support platforms like Next on OpenNext/Cloudflare.
   */
  runtime?: { name: string; version?: string };
  /**
   * Sets profiling sample rate when @sentry/profiling-node is installed
   *
   * @deprecated
   */
  profilesSampleRate?: number;

  /**
   * Function to compute profiling sample rate dynamically and filter unwanted profiles.
   *
   * Profiling is enabled if either this or `profilesSampleRate` is defined. If both are defined, `profilesSampleRate` is
   * ignored.
   *
   * Will automatically be passed a context object of default and optional custom data.
   *
   * @returns A sample rate between 0 and 1 (0 drops the profile, 1 guarantees it will be sent). Returning `true` is
   * equivalent to returning 1 and returning `false` is equivalent to returning 0.
   *
   * @deprecated
   */
  profilesSampler?: (samplingContext: SamplingContext) => number | boolean;

  /**
   * Sets profiling session sample rate for the entire profiling session (evaluated once per SDK initialization).
   *
   * @default 0
   */
  profileSessionSampleRate?: number;

  /**
   * Set the lifecycle mode of the profiler.
   * - **manual**: The profiler will be manually started and stopped via `startProfiler`/`stopProfiler`.
   *    If a session is sampled, is dependent on the `profileSessionSampleRate`.
   * - **trace**: The profiler will be automatically started when a root span exists and stopped when there are no
   *    more sampled root spans. Whether a session is sampled, is dependent on the `profileSessionSampleRate` and the
   *    existing sampling configuration for tracing (`tracesSampleRate`/`tracesSampler`).
   *
   * @default 'manual'
   */
  profileLifecycle?: 'manual' | 'trace';

  /**
   * Include local variables with stack traces.
   *
   * Requires the `LocalVariables` integration.
   */
  includeLocalVariables?: boolean;
}

/**
 * Configuration options for the Sentry Node SDK
 * @see @sentry/core Options for more information.
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
