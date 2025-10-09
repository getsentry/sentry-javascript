import type { CaptureContext } from '../scope';
import type { Breadcrumb, BreadcrumbHint } from './breadcrumb';
import type { ErrorEvent, EventHint, TransactionEvent } from './event';
import type { Integration } from './integration';
import type { Log } from './log';
import type { Metric } from './metric';
import type { TracesSamplerSamplingContext } from './samplingcontext';
import type { SdkMetadata } from './sdkmetadata';
import type { SpanJSON } from './span';
import type { StackLineParser, StackParser } from './stacktrace';
import type { TracePropagationTargets } from './tracing';
import type { BaseTransportOptions, Transport } from './transport';

/**
 * A filter object for ignoring spans.
 * At least one of the properties (`op` or `name`) must be set.
 */
type IgnoreSpanFilter =
  | {
      /**
       * Spans with a name matching this pattern will be ignored.
       */
      name: string | RegExp;
      /**
       * Spans with an op matching this pattern will be ignored.
       */
      op?: string | RegExp;
    }
  | {
      /**
       * Spans with a name matching this pattern will be ignored.
       */
      name?: string | RegExp;
      /**
       * Spans with an op matching this pattern will be ignored.
       */
      op: string | RegExp;
    };

export interface ClientOptions<TO extends BaseTransportOptions = BaseTransportOptions> {
  /**
   * Enable debug functionality in the SDK itself. If `debug` is set to `true` the SDK will attempt
   * to print out useful debugging information about what the SDK is doing.
   *
   * @default false
   */
  debug?: boolean;

  /**
   * Specifies whether this SDK should send events to Sentry. Setting this to `enabled: false`
   * doesn't prevent all overhead from Sentry instrumentation. To disable Sentry completely,
   * depending on environment, call `Sentry.init conditionally.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * When enabled, stack traces are automatically attached to all events captured with `Sentry.captureMessage`.
   *
   * Grouping in Sentry is different for events with stack traces and without. As a result, you will get
   * new groups as you enable or disable this flag for certain events.
   *
   * @default false
   */
  attachStacktrace?: boolean;

  /**
   * Send SDK Client Reports, which are used to emit outcomes about events that the SDK dropped
   * or failed to capture.
   *
   * @default true
   */
  sendClientReports?: boolean;

  /**
   * The DSN tells the SDK where to send the events. If this is not set, the SDK will not send any events to Sentry.
   *
   * @default undefined
   */
  dsn?: string;

  /**
   * Sets the release. Release names are strings, but some formats are detected by Sentry and might be
   * rendered differently. Learn more about how to send release data so Sentry can tell you about
   * regressions between releases and identify the potential source in the
   * [releases documentation](https://docs.sentry.io/product/releases/)
   *
   * @default undefined
   */
  release?: string;

  /**
   * The current environment of your application (e.g. "production").
   *
   * Environments are case-sensitive. The environment name can't contain newlines, spaces or forward slashes,
   * can't be the string "None", or exceed 64 characters. You can't delete environments, but you can hide them.
   *
   * @default "production"
   */
  environment?: string;

  /**
   * Sets the distribution of the application. Distributions are used to disambiguate build or
   * deployment variants of the same release of an application.
   *
   * @default undefined
   */
  dist?: string;

  /**
   * List of integrations that should be installed after SDK was initialized.
   *
   * @default []
   */
  integrations: Integration[];

  /**
   * A function that takes transport options and returns the Transport object which is used to send events to Sentry.
   * The function is invoked internally when the client is initialized.
   */
  transport: (transportOptions: TO) => Transport;

  /**
   * A stack parser implementation. By default, a stack parser is supplied for all supported platforms.
   */
  stackParser: StackParser;

  /**
   * Options for the default transport that the SDK uses.
   */
  transportOptions?: Partial<TO>;

  /**
   * Sample rate to determine trace sampling.
   *
   * 0.0 = 0% chance of a given trace being sent (send no traces) 1.0 = 100% chance of a given trace being sent (send
   * all traces).
   *
   * Tracing is enabled if either this or `tracesSampler` is defined. If both are defined, `tracesSampleRate` is
   * ignored. Set this and `tracesSampler` to `undefined` to disable tracing.
   *
   * @default undefined
   */
  tracesSampleRate?: number;

  /**
   * If this is enabled, any spans started will always have their parent be the active root span,
   * if there is any active span.
   *
   * This is necessary because in some environments (e.g. browser),
   * we cannot guarantee an accurate active span.
   * Because we cannot properly isolate execution environments,
   * you may get wrong results when using e.g. nested `startSpan()` calls.
   *
   * To solve this, in these environments we'll by default enable this option.
   */
  parentSpanIsAlwaysRootSpan?: boolean;

  /**
   * Initial data to populate scope.
   *
   * @default undefined
   */
  initialScope?: CaptureContext;

  /**
   * The maximum number of breadcrumbs sent with events.
   * Sentry has a maximum payload size of 1MB and any events exceeding that payload size will be dropped.
   *
   * @default 100
   */
  maxBreadcrumbs?: number;

  /**
   * A global sample rate to apply to all error events.
   *
   * 0.0 = 0% chance of a given event being sent (send no events) 1.0 = 100% chance of a given event being sent (send
   * all events)
   *
   * @default 1.0
   */
  sampleRate?: number;

  /**
   * Maximum number of chars a single value can have before it will be truncated.
   *
   * @default 250
   */
  maxValueLength?: number;

  /**
   * Maximum number of levels that normalization algorithm will traverse in objects and arrays.
   * Used when normalizing an event before sending, on all of the listed attributes:
   * - `breadcrumbs.data`
   * - `user`
   * - `contexts`
   * - `extra`
   *
   * @default 3
   */
  normalizeDepth?: number;

  /**
   * Maximum number of properties or elements that the normalization algorithm will output in any single array or object included in the normalized event.
   * Used when normalizing an event before sending, on all of the listed attributes:
   * - `breadcrumbs.data`
   * - `user`
   * - `contexts`
   * - `extra`
   *
   * @default 1000
   */
  normalizeMaxBreadth?: number;

  /**
   * A pattern for error messages which should not be sent to Sentry.
   * By default, all errors will be sent.
   *
   * Behavior of the `ignoreErrors` option is controlled by the `Sentry.eventFiltersIntegration` integration. If the
   * event filters integration is not installed, the `ignoreErrors` option will not have any effect.
   *
   * @default []
   */
  ignoreErrors?: Array<string | RegExp>;

  /**
   * A pattern for transaction names which should not be sent to Sentry.
   * By default, all transactions will be sent.
   *
   * Behavior of the `ignoreTransactions` option is controlled by the `Sentry.eventFiltersIntegration` integration.
   * If the event filters integration is not installed, the `ignoreTransactions` option will not have any effect.
   *
   * @default []
   */
  ignoreTransactions?: Array<string | RegExp>;

  /**
   * A list of span names or patterns to ignore.
   *
   * If you specify a pattern {@link IgnoreSpanFilter}, at least one
   * of the properties (`op` or `name`) must be set.
   *
   * @default []
   */
  ignoreSpans?: (string | RegExp | IgnoreSpanFilter)[];

  /**
   * A URL to an envelope tunnel endpoint. An envelope tunnel is an HTTP endpoint
   * that accepts Sentry envelopes for forwarding. This can be used to force data
   * through a custom server independent of the type of data.
   *
   * @default undefined
   */
  tunnel?: string;

  /**
   * Controls if potentially sensitive data should be sent to Sentry by default.
   * Note that this only applies to data that the SDK is sending by default
   * but not data that was explicitly set (e.g. by calling `Sentry.setUser()`).
   *
   * @default false
   *
   * NOTE: This option currently controls only a few data points in a selected
   * set of SDKs. The goal for this option is to eventually control all sensitive
   * data the SDK sets by default. However, this would be a breaking change so
   * until the next major update this option only controls data points which were
   * added in versions above `7.9.0`.
   */
  sendDefaultPii?: boolean;

  /**
   * Set of metadata about the SDK that can be internally used to enhance envelopes and events,
   * and provide additional data about every request.
   *
   * @internal This option is not part of the public API and is subject to change at any time.
   */
  _metadata?: SdkMetadata;

  /**
   * Options which are in beta, or otherwise not guaranteed to be stable.
   */
  _experiments?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;

    /**
     * If metrics support should be enabled.
     *
     * @default false
     * @experimental
     */
    enableMetrics?: boolean;

    /**
     * An event-processing callback for metrics, guaranteed to be invoked after all other metric
     * processors. This allows a metric to be modified or dropped before it's sent.
     *
     * Note that you must return a valid metric from this callback. If you do not wish to modify the metric, simply return
     * it at the end. Returning `null` will cause the metric to be dropped.
     *
     * @default undefined
     * @experimental
     *
     * @param metric The metric generated by the SDK.
     * @returns A new metric that will be sent | null.
     */
    beforeSendMetric?: (metric: Metric) => Metric | null;
  };

  /**
   * A pattern for error URLs which should exclusively be sent to Sentry.
   * This is the opposite of {@link CoreOptions.denyUrls}.
   * By default, all errors will be sent.
   *
   * Behavior of the `allowUrls` option is controlled by the `Sentry.eventFiltersIntegration` integration.
   * If the event filters integration is not installed, the `allowUrls` option will not have any effect.
   *
   * @default []
   */
  allowUrls?: Array<string | RegExp>;

  /**
   * A pattern for error URLs which should not be sent to Sentry.
   * To allow certain errors instead, use {@link CoreOptions.allowUrls}.
   * By default, all errors will be sent.
   *
   * Behavior of the `denyUrls` option is controlled by the `Sentry.eventFiltersIntegration` integration.
   * If the event filters integration is not installed, the `denyUrls` option will not have any effect.
   *
   * @default []
   */
  denyUrls?: Array<string | RegExp>;

  /**
   * List of strings and/or Regular Expressions used to determine which outgoing requests will have `sentry-trace` and `baggage`
   * headers attached.
   *
   * **Default:** If this option is not provided, tracing headers will be attached to all outgoing requests.
   * If you are using a browser SDK, by default, tracing headers will only be attached to outgoing requests to the same origin.
   *
   * **Disclaimer:** Carelessly setting this option in browser environments may result into CORS errors!
   * Only attach tracing headers to requests to the same origin, or to requests to services you can control CORS headers of.
   * Cross-origin requests, meaning requests to a different domain, for example a request to `https://api.example.com/` while you're on `https://example.com/`, take special care.
   * If you are attaching headers to cross-origin requests, make sure the backend handling the request returns a `"Access-Control-Allow-Headers: sentry-trace, baggage"` header to ensure your requests aren't blocked.
   *
   * If you provide a `tracePropagationTargets` array, the entries you provide will be matched against the entire URL of the outgoing request.
   * If you are using a browser SDK, the entries will also be matched against the pathname of the outgoing requests.
   * This is so you can have matchers for relative requests, for example, `/^\/api/` if you want to trace requests to your `/api` routes on the same domain.
   *
   * If any of the two match any of the provided values, tracing headers will be attached to the outgoing request.
   * Both, the string values, and the RegExes you provide in the array will match if they partially match the URL or pathname.
   *
   * Examples:
   * - `tracePropagationTargets: [/^\/api/]` and request to `https://same-origin.com/api/posts`:
   *   - Tracing headers will be attached because the request is sent to the same origin and the regex matches the pathname "/api/posts".
   * - `tracePropagationTargets: [/^\/api/]` and request to `https://different-origin.com/api/posts`:
   *   - Tracing headers will not be attached because the pathname will only be compared when the request target lives on the same origin.
   * - `tracePropagationTargets: [/^\/api/, 'https://external-api.com']` and request to `https://external-api.com/v1/data`:
   *   - Tracing headers will be attached because the request URL matches the string `'https://external-api.com'`.
   */
  tracePropagationTargets?: TracePropagationTargets;

  /**
   * If set to `true`, the SDK will only continue a trace if the `organization ID` of the incoming trace found in the
   * `baggage` header matches the `organization ID` of the current Sentry client.
   *
   * The client's organization ID is extracted from the DSN or can be set with the `orgId` option.
   *
   * If the organization IDs do not match, the SDK will start a new trace instead of continuing the incoming one.
   * This is useful to prevent traces of unknown third-party services from being continued in your application.
   *
   * @default false
   */
  strictTraceContinuation?: boolean;

  /**
   * The organization ID for your Sentry project.
   *
   * The SDK will try to extract the organization ID from the DSN. If it cannot be found, or if you need to override it,
   * you can provide the ID with this option. The organization ID is used for trace propagation and for features like `strictTraceContinuation`.
   */
  orgId?: `${number}` | number;

  /**
   * If logs support should be enabled.
   *
   * @default false
   */
  enableLogs?: boolean;

  /**
   * An event-processing callback for logs, guaranteed to be invoked after all other log
   * processors. This allows a log to be modified or dropped before it's sent.
   *
   * Note that you must return a valid log from this callback. If you do not wish to modify the log, simply return
   * it at the end. Returning `null` will cause the log to be dropped.
   *
   * @default undefined
   *
   * @param log The log generated by the SDK.
   * @returns A new log that will be sent | null.
   */
  beforeSendLog?: (log: Log) => Log | null;

  /**
   * Function to compute tracing sample rate dynamically and filter unwanted traces.
   *
   * Tracing is enabled if either this or `tracesSampleRate` is defined. If both are defined, `tracesSampleRate` is
   * ignored. Set this and `tracesSampleRate` to `undefined` to disable tracing.
   *
   * Will automatically be passed a context object of default and optional custom data.
   *
   * @returns A sample rate between 0 and 1 (0 drops the trace, 1 guarantees it will be sent). Returning `true` is
   * equivalent to returning 1 and returning `false` is equivalent to returning 0.
   */
  tracesSampler?: (samplingContext: TracesSamplerSamplingContext) => number | boolean;

  /**
   * An event-processing callback for error and message events, guaranteed to be invoked after all other event
   * processors, which allows an event to be modified or dropped.
   *
   * Note that you must return a valid event from this callback. If you do not wish to modify the event, simply return
   * it at the end. Returning `null` will cause the event to be dropped.
   *
   * @param event The error or message event generated by the SDK.
   * @param hint Event metadata useful for processing.
   * @returns A new event that will be sent | null.
   */
  beforeSend?: (event: ErrorEvent, hint: EventHint) => PromiseLike<ErrorEvent | null> | ErrorEvent | null;

  /**
   * This function can be defined to modify a child span before it's sent.
   *
   * @param span The span generated by the SDK.
   *
   * @returns The modified span payload that will be sent.
   */
  beforeSendSpan?: (span: SpanJSON) => SpanJSON;

  /**
   * An event-processing callback for transaction events, guaranteed to be invoked after all other event
   * processors. This allows an event to be modified or dropped before it's sent.
   *
   * Note that you must return a valid event from this callback. If you do not wish to modify the event, simply return
   * it at the end. Returning `null` will cause the event to be dropped.
   *
   * @param event The error or message event generated by the SDK.
   * @param hint Event metadata useful for processing.
   * @returns A new event that will be sent | null.
   */
  beforeSendTransaction?: (
    event: TransactionEvent,
    hint: EventHint,
  ) => PromiseLike<TransactionEvent | null> | TransactionEvent | null;

  /**
   * A callback invoked when adding a breadcrumb, allowing to optionally modify
   * it before adding it to future events.
   *
   * Note that you must return a valid breadcrumb from this callback. If you do
   * not wish to modify the breadcrumb, simply return it at the end.
   * Returning null will cause the breadcrumb to be dropped.
   *
   * @param breadcrumb The breadcrumb as created by the SDK.
   * @returns The breadcrumb that will be added | null.
   */
  beforeBreadcrumb?: (breadcrumb: Breadcrumb, hint?: BreadcrumbHint) => Breadcrumb | null;
}

/** Base configuration options for every SDK. */
export interface CoreOptions<TO extends BaseTransportOptions = BaseTransportOptions>
  extends Omit<Partial<ClientOptions<TO>>, 'integrations' | 'transport' | 'stackParser'> {
  /**
   * If this is set to false, default integrations will not be added, otherwise this will internally be set to the
   * recommended default integrations.
   */
  defaultIntegrations?: false | Integration[];

  /**
   * List of integrations that should be installed after SDK was initialized.
   * Accepts either a list of integrations or a function that receives
   * default integrations and returns a new, updated list.
   */
  integrations?: Integration[] | ((integrations: Integration[]) => Integration[]);

  /**
   * A function that takes transport options and returns the Transport object which is used to send events to Sentry.
   * The function is invoked internally during SDK initialization.
   * By default, the SDK initializes its default transports.
   */
  transport?: (transportOptions: TO) => Transport;

  /**
   * A stack parser implementation or an array of stack line parsers
   * By default, a stack parser is supplied for all supported browsers
   */
  stackParser?: StackParser | StackLineParser[];
}
