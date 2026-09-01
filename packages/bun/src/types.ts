import type { BaseTransportOptions, ClientOptions, Options } from '@sentry/core';
import type { ServerRuntimeOptions } from '@sentry/core/server';

/**
 * Base options for the Sentry Bun SDK.
 */
export interface BaseBunOptions extends ServerRuntimeOptions {
  /**
   * Controls whether the SDK registers its own Sentry OpenTelemetry tracer provider.
   *
   * When `false` (the default), no tracer provider is set up. The SDK isolates scopes with a native
   * AsyncLocalStorage context strategy and still emits spans via its own instrumentation, but spans
   * created through `@opentelemetry/api` are not captured.
   *
   * When `true`, the SDK registers its own `SentryTracerProvider` (and `SentryPropagator`) as the
   * global OpenTelemetry tracer provider, so spans created through `@opentelemetry/api` become Sentry
   * spans. If you run your own tracer provider, keep this `false` so the SDK does not register a
   * competing provider; note the SDK no longer feeds spans into a user-owned provider, so those spans
   * stay in your OpenTelemetry pipeline.
   *
   * @default false
   */
  enableOpenTelemetrySetup?: boolean;
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
