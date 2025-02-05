import type { Span as WriteableSpan } from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ClientOptions, Options, SamplingContext, Scope, Span, TracePropagationTargets } from '@sentry/core';

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
   * Will automatically be passed a context object of default and optional custom data.
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
   *
   * If you are registering your own OpenTelemetry Loader Hooks (or `import-in-the-middle` hooks), it is also recommended to set the `registerEsmLoaderHooks` option to false.
   */
  skipOpenTelemetrySetup?: boolean;

  /**
   * Provide an array of OpenTelemetry Instrumentations that should be registered.
   *
   * Use this option if you want to register OpenTelemetry instrumentation that the Sentry SDK does not yet have support for.
   */
  openTelemetryInstrumentations?: Instrumentation[];

  /**
   * Provide an array of additional OpenTelemetry SpanProcessors that should be registered.
   */
  openTelemetrySpanProcessors?: SpanProcessor[];

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
   * Whether to register ESM loader hooks to automatically instrument libraries.
   * This is necessary to auto instrument libraries that are loaded via ESM imports, but it can cause issues
   * with certain libraries. If you run into problems running your app with this enabled,
   * please raise an issue in https://github.com/getsentry/sentry-javascript.
   *
   * Defaults to `true`.
   */
  registerEsmLoaderHooks?: boolean;

  /**
   * Configures in which interval client reports will be flushed. Defaults to `60_000` (milliseconds).
   */
  clientReportFlushInterval?: number;

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

  /** Callback that is executed when a fatal global error occurs. */
  onFatalError?(this: void, error: Error): void;
}

/**
 * Configuration options for the Sentry Node SDK
 * @see @sentry/core Options for more information.
 */
export interface NodeOptions<AdditionalDefaultIntegrations extends string[] = []>
  extends Options<
      NodeTransportOptions,
      [
        'InboundFilters',
        'FunctionToString',
        'LinkedErrors',
        'RequestData',
        'Console',
        'Http',
        'NodeFetch',
        'OnUncaughtException',
        'OnUnhandledRejection',
        'ContextLines',
        'LocalVariables',
        'Context',
        'ChildProcess',
        'ProcessSession',
        'Modules',
        'Express',
        'Fastify',
        'Graphql',
        'Mongo',
        'Mongoose',
        'Mysql',
        'Mysql2',
        'Redis',
        'Postgres',
        'Prisma',
        'Hapi',
        'Koa',
        'Connect',
        'Tedious',
        'GenericPool',
        'Kafka',
        'Amqplib',
        'LruMemoizer',
        'VercelAI',
        ...AdditionalDefaultIntegrations,
      ]
    >,
    BaseNodeOptions {}

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
 * You'll have to make sur to check relevant fields before accessing them.
 *
 * Note that technically, the `Span` exported from `@opentelemetry/sdk-trace-base` matches this,
 * but we cannot be 100% sure that we are actually getting such a span, so this type is more defensive.
 */
export type AbstractSpan = WriteableSpan | ReadableSpan | Span;
