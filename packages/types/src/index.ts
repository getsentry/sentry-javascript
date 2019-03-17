/** Supported Sentry transport protocols in a Dsn. */
export type DsnProtocol = 'http' | 'https';

/** Primitive components of a Dsn. */
export interface DsnComponents {
  /** Protocol used to connect to Sentry. */
  protocol: DsnProtocol;
  /** Public authorization key. */
  user: string;
  /** Private authorization key (deprecated, optional). */
  pass?: string;
  /** Hostname of the Sentry instance. */
  host: string;
  /** Port of the Sentry instance. */
  port?: string;
  /** Sub path/ */
  path?: string;
  /** Project ID */
  projectId: string;
}

/** Anything that can be parsed into a Dsn. */
export type DsnLike = string | DsnComponents;

/** JSDoc */
export enum Severity {
  /** JSDoc */
  Fatal = 'fatal',
  /** JSDoc */
  Error = 'error',
  /** JSDoc */
  Warning = 'warning',
  /** JSDoc */
  Log = 'log',
  /** JSDoc */
  Info = 'info',
  /** JSDoc */
  Debug = 'debug',
  /** JSDoc */
  Critical = 'critical',
}

// tslint:disable:no-unnecessary-qualifier no-namespace
export namespace Severity {
  /**
   * Converts a string-based level into a {@link Severity}.
   *
   * @param level string representation of Severity
   * @returns Severity
   */
  export function fromString(level: string): Severity {
    switch (level) {
      case 'debug':
        return Severity.Debug;
      case 'info':
        return Severity.Info;
      case 'warn':
      case 'warning':
        return Severity.Warning;
      case 'error':
        return Severity.Error;
      case 'fatal':
        return Severity.Fatal;
      case 'critical':
        return Severity.Critical;
      case 'log':
      default:
        return Severity.Log;
    }
  }
}

/** JSDoc */
export interface Breadcrumb {
  type?: string;
  level?: Severity;
  event_id?: string;
  category?: string;
  message?: string;
  data?: any;
  timestamp?: number;
}

/** JSDoc */
export interface User {
  [key: string]: any;
  id?: string;
  ip_address?: string;
  email?: string;
  username?: string;
}

/** JSDoc */
export interface SdkInfo {
  name: string;
  version: string;
  integrations?: string[];
  packages?: Package[];
}

/** JSDoc */
export interface Package {
  name: string;
  version: string;
}

/** JSDoc */
export interface StackFrame {
  filename?: string;
  function?: string;
  module?: string;
  platform?: string;
  lineno?: number;
  colno?: number;
  abs_path?: string;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  in_app?: boolean;
  vars?: { [key: string]: any };
}

/** JSDoc */
export interface Stacktrace {
  frames?: StackFrame[];
  frames_omitted?: [number, number];
}

/** JSDoc */
export interface Thread {
  id?: number;
  name?: string;
  stacktrace?: Stacktrace;
  crashed?: boolean;
  current?: boolean;
}

/** JSDoc */
export interface SentryException {
  type?: string;
  value?: string;
  module?: string;
  thread_id?: number;
  stacktrace?: Stacktrace;
}

/** JSDoc */
export interface Request {
  url?: string;
  method?: string;
  data?: any;
  query_string?: string;
  cookies?: { [key: string]: string };
  env?: { [key: string]: string };
  headers?: { [key: string]: string };
}

/** JSDoc */
export interface SentryEvent {
  event_id?: string;
  message?: string;
  timestamp?: number;
  level?: Severity;
  platform?: string;
  logger?: string;
  server_name?: string;
  release?: string;
  dist?: string;
  environment?: string;
  sdk?: SdkInfo;
  request?: Request;
  transaction?: string;
  modules?: { [key: string]: string };
  fingerprint?: string[];
  exception?: {
    values?: SentryException[];
    mechanism?: Mechanism;
  };
  stacktrace?: Stacktrace;
  breadcrumbs?: Breadcrumb[];
  contexts?: { [key: string]: object };
  tags?: { [key: string]: string };
  extra?: { [key: string]: any };
  user?: User;
}

/** JSDoc */
export interface Mechanism {
  type: string;
  handled: boolean;
  data?: {
    [key: string]: string;
  };
}

/** Integration interface */
export interface Integration {
  /**
   * Returns {@link IntegrationClass.id}
   */
  name: string;
  // TODO: Remove with v5
  /** @deprecated */
  install?(options?: object): void;

  // This takes no options on purpose, options should be passed in the constructor
  setupOnce(): void; // TODO: make not optional
}

/** Integration Class Interface */
export interface IntegrationClass<T> {
  new (): T;
  /**
   * Property that holds the integration name
   */
  id: string;
}

/** JSDoc */
export interface SentryResponse {
  status: Status;
  event?: SentryEvent;
  reason?: string;
}

/** JSDoc */
export interface TransportOptions {
  [key: string]: any;
  /** Sentry DSN */
  dsn: DsnLike;
  /** Define custom headers */
  headers?: object;
  /** Set a HTTP proxy that should be used for outbound requests. */
  httpProxy?: string;
  /** Set a HTTPS proxy that should be used for outbound requests. */
  httpsProxy?: string;
  /** HTTPS proxy certificates path */
  caCerts?: string;
}

/** Transport used sending data to Sentry */
export interface Transport {
  /**
   * Sends the body to the Store endpoint in Sentry.
   *
   * @param body String body that should be sent to Sentry.
   */
  sendEvent(body: string): Promise<SentryResponse>;

  /**
   * Call this function to wait until all pending requests have been sent.
   *
   * @param timeout Number time in ms to wait until the buffer is drained.
   */
  close(timeout?: number): Promise<boolean>;

  // TODO: Remove with v5
  /** @deprecated Implement sendEvent instead */
  captureEvent?(event: SentryEvent): Promise<SentryResponse>;
}

/** JSDoc */
export interface TransportClass<T extends Transport> {
  new (options: TransportOptions): T;
}

/** The status of an event. */
export enum Status {
  /** The status could not be determined. */
  Unknown = 'unknown',
  /** The event was skipped due to configuration or callbacks. */
  Skipped = 'skipped',
  /** The event was sent to Sentry successfully. */
  Success = 'success',
  /** The client is currently rate limited and will try again later. */
  RateLimit = 'rate_limit',
  /** The event could not be processed. */
  Invalid = 'invalid',
  /** A server-side error ocurred during submission. */
  Failed = 'failed',
}

// tslint:disable:no-unnecessary-qualifier no-namespace
export namespace Status {
  /**
   * Converts a HTTP status code into a {@link Status}.
   *
   * @param code The HTTP response status code.
   * @returns The send status or {@link Status.Unknown}.
   */
  export function fromHttpCode(code: number): Status {
    if (code >= 200 && code < 300) {
      return Status.Success;
    }

    if (code === 429) {
      return Status.RateLimit;
    }

    if (code >= 400 && code < 500) {
      return Status.Invalid;
    }

    if (code >= 500) {
      return Status.Failed;
    }

    return Status.Unknown;
  }
}

/** JSDoc */
export interface SentryWrappedFunction extends Function {
  [key: string]: any;
  __sentry__?: boolean;
  __sentry_wrapped__?: SentryWrappedFunction;
  __sentry_original__?: SentryWrappedFunction;
}

/** JSDoc */
export interface SentryEventHint {
  event_id?: string;
  syntheticException?: Error | null;
  originalException?: Error | null;
  data?: any;
}

/** JSDoc */
export interface SentryBreadcrumbHint {
  [key: string]: any;
}

export type EventProcessor = (
  event: SentryEvent,
  hint?: SentryEventHint,
) => Promise<SentryEvent | null> | SentryEvent | null;

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export interface ScopeInterface {
  /** Add internal on change listener. */
  addScopeListener(callback: (scope: ScopeInterface) => void): void;

  /** Add new event processor that will be called after {@link applyToEvent}. */
  addEventProcessor(callback: EventProcessor): ScopeInterface;

  /**
   * Updates user context information for future events.
   * @param user User context object to be set in the current context.
   */
  setUser(user: User): ScopeInterface;

  /**
   * Updates tags context information for future events.
   * @param tags Tags context object to merge into current context.
   */
  setTag(key: string, value: string): ScopeInterface;

  /**
   * Updates extra context information for future events.
   * @param extra context object to merge into current context.
   */
  setExtra(key: string, extra: any): ScopeInterface;

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint string[] to group events in Sentry.
   */
  setFingerprint(fingerprint: string[]): ScopeInterface;

  /**
   * Sets the level on the scope for future events.
   * @param level string {@link Severity}
   */
  setLevel(level: Severity): ScopeInterface;

  /** Clears the current scope and resets its properties. */
  clear(): void;

  /**
   * Sets the breadcrumbs in the scope
   * @param breadcrumbs Breadcrumb
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void;

  /**
   * Applies the current context and fingerprint to the event.
   * Note that breadcrumbs will be added by the client.
   * Also if the event has already breadcrumbs on it, we do not merge them.
   * @param event SentryEvent
   * @param hint May contain additional informartion about the original exception.
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  applyToEvent(event: SentryEvent, hint?: SentryEventHint, maxBreadcrumbs?: number): Promise<SentryEvent | null>;
}

/** Console logging verbosity for the SDK. */
export enum LogLevel {
  /** No logs will be generated. */
  None = 0,
  /** Only SDK internal errors will be logged. */
  Error = 1,
  /** Information useful for debugging the SDK will be logged. */
  Debug = 2,
  /** All SDK actions will be logged. */
  Verbose = 3,
}

/** Base configuration options for every SDK. */
export interface Options {
  /**
   * Enable debug functionality in the SDK itself
   */
  debug?: boolean;

  /**
   * Specifies whether this SDK should activate and send events to Sentry.
   * Disabling the SDK reduces all overhead from instrumentation, collecting
   * breadcrumbs and capturing events. Defaults to true.
   */
  enabled?: boolean;

  /**
   * The Dsn used to connect to Sentry and identify the project. If omitted, the
   * SDK will not send any data to Sentry.
   */
  dsn?: string;

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
   * A pattern for error messages which should not be sent to Sentry.
   * By default, all errors will be sent.
   */
  ignoreErrors?: Array<string | RegExp>;

  /**
   * Transport object that should be used to send events to Sentry
   */
  transport?: TransportClass<Transport>;

  /**
   * Options for the default transport that the SDK uses.
   */
  transportOptions?: TransportOptions;

  /**
   * The release identifier used when uploading respective source maps. Specify
   * this value to allow Sentry to resolve the correct source maps when
   * processing events.
   */
  release?: string;

  /** The current environment of your application (e.g. "production"). */
  environment?: string;

  /** Sets the distribution for all events */
  dist?: string;

  /** The maximum number of breadcrumbs sent with events. Defaults to 100. */
  maxBreadcrumbs?: number;

  /** Console logging verbosity for the SDK Client. */
  logLevel?: LogLevel;

  /** A global sample rate to apply to all events (0 - 1). */
  sampleRate?: number;

  /** Attaches stacktraces to pure capture message / log integrations */
  attachStacktrace?: boolean;

  /**
   * A callback invoked during event submission, allowing to optionally modify
   * the event before it is sent to Sentry.
   *
   * Note that you must return a valid event from this callback. If you do not
   * wish to modify the event, simply return it at the end.
   * Returning null will case the event to be dropped.
   *
   * @param event The error or message event generated by the SDK.
   * @param hint May contain additional information about the original exception.
   * @returns A new event that will be sent | null.
   */
  beforeSend?(event: SentryEvent, hint?: SentryEventHint): SentryEvent | null | Promise<SentryEvent | null>;

  /**
   * A callback invoked when adding a breadcrumb, allowing to optionally modify
   * it before adding it to future events.
   *
   * Note that you must return a valid breadcrumb from this callback. If you do
   * not wish to modify the breadcrumb, simply return it at the end.
   * Returning null will case the breadcrumb to be dropped.
   *
   * @param breadcrumb The breadcrumb as created by the SDK.
   * @returns The breadcrumb that will be added | null.
   */
  beforeBreadcrumb?(breadcrumb: Breadcrumb, hint?: SentryBreadcrumbHint): Breadcrumb | null;
}

/**
 * User-Facing Sentry SDK Client Client.
 *
 * This interface contains all methods to interface with the SDK once it has
 * been installed. It allows to send events to Sentry, record breadcrumbs and
 * set a context included in every event. Since the SDK mutates its environment,
 * there will only be one instance during runtime. To retrieve that instance,
 * use {@link Client.getInstance}.
 *
 * Note that the call to {@link Client.install} should occur as early as
 * possible so that even errors during startup can be recorded reliably:
 *
 * @example
 * import { captureMessage } from '@sentry/node';
 * captureMessage('Custom message');
 */
export interface Client<O extends Options = Options> {
  /**
   * Installs the SDK if it hasn't been installed already.
   *
   * Since this performs modifications in the environment, such as instrumenting
   * library functionality or adding signal handlers, this method will only
   * execute once and cache its result.
   *
   * @returns If the installation was the successful or not.
   */
  install(): boolean;

  /**
   * Captures an exception event and sends it to Sentry.
   *
   * @param exception An exception-like object.
   * @param hint May contain additional information about the original exception.
   * @param scope An optional scope containing event metadata.
   * @returns SentryResponse status and event
   */
  captureException(exception: any, hint?: SentryEventHint, scope?: ScopeInterface): Promise<SentryResponse>;

  /**
   * Captures a message event and sends it to Sentry.
   *
   * @param message The message to send to Sentry.
   * @param level Define the level of the message.
   * @param hint May contain additional information about the original exception.
   * @param scope An optional scope containing event metadata.
   * @returns SentryResponse status and event
   */
  captureMessage(
    message: string,
    level?: Severity,
    hint?: SentryEventHint,
    scope?: ScopeInterface,
  ): Promise<SentryResponse>;

  /**
   * Captures a manually created event and sends it to Sentry.
   *
   * @param event The event to send to Sentry.
   * @param hint May contain additional information about the original exception.
   * @param scope An optional scope containing event metadata.
   * @returns SentryResponse status and event
   */
  captureEvent(event: SentryEvent, hint?: SentryEventHint, scope?: ScopeInterface): Promise<SentryResponse>;

  /**
   * Records a new breadcrumb which will be attached to future events.
   *
   * Breadcrumbs will be added to subsequent events to provide more context on
   * user's actions prior to an error or crash. To configure the maximum number
   * of breadcrumbs, use {@link Options.maxBreadcrumbs}.
   *
   * @param breadcrumb The breadcrumb to record.
   * @param hint May contain additional information about the original breadcrumb.
   * @param scope An optional scope to store this breadcrumb in.
   */
  addBreadcrumb(breadcrumb: Breadcrumb, hint?: SentryBreadcrumbHint, scope?: ScopeInterface): void;

  /** Returns the current Dsn. */
  getDsn(): DsnComponents | undefined;

  /** Returns the current options. */
  getOptions(): O;

  /**
   * A promise that resolves when all current events have been sent.
   * If you provide a timeout and the queue takes longer to drain the promise returns false.
   *
   * @param timeout Maximum time in ms the client should wait.
   */
  close(timeout?: number): Promise<boolean>;

  /**
   * A promise that resolves when all current events have been sent.
   * If you provide a timeout and the queue takes longer to drain the promise returns false.
   *
   * @param timeout Maximum time in ms the client should wait.
   */
  flush(timeout?: number): Promise<boolean>;

  /** Returns an array of installed integrations on the client. */
  getIntegration<T extends Integration>(integartion: IntegrationClass<T>): T | null;
}

/**
 * Internal platform-dependent Sentry SDK Backend.
 *
 * While {@link Client} contains business logic specific to an SDK, the
 * Backend offers platform specific implementations for low-level operations.
 * These are persisting and loading information, sending events, and hooking
 * into the environment.
 *
 * Backends receive a handle to the Client in their constructor. When a
 * Backend automatically generates events or breadcrumbs, it must pass them to
 * the Client for validation and processing first.
 *
 * Usually, the Client will be of corresponding type, e.g. NodeBackend
 * receives NodeClient. However, higher-level SDKs can choose to instanciate
 * multiple Backends and delegate tasks between them. In this case, an event
 * generated by one backend might very well be sent by another one.
 *
 * The client also provides access to options via {@link Client.getOptions}
 * and context via {@link Client.getContext}. Note that the user might update
 * these any time and they should not be cached.
 */
export interface Backend {
  /** Installs the SDK into the environment. */
  install?(): boolean;

  /** Creates a {@link SentryEvent} from an exception. */
  eventFromException(exception: any, hint?: SentryEventHint): Promise<SentryEvent>;

  /** Creates a {@link SentryEvent} from a plain message. */
  eventFromMessage(message: string, level?: Severity, hint?: SentryEventHint): Promise<SentryEvent>;

  /** Submits the event to Sentry */
  sendEvent(event: SentryEvent): Promise<SentryResponse>;

  /**
   * Receives a breadcrumb and stores it in a platform-dependent way.
   *
   * This function is invoked by the client before merging the breadcrumb into
   * the scope. Return `false` to prevent this breadcrumb from being merged.
   * This should be done for custom breadcrumb management in the backend.
   *
   * In most cases, this method does not have to perform any action and can
   * simply return `true`. It can either be synchronous or asynchronous.
   *
   * @param breadcrumb The breadcrumb to store.
   * @returns True if the breadcrumb should be merged by the client.
   */
  storeBreadcrumb(breadcrumb: Breadcrumb): boolean;

  /**
   * Receives the whole scope and stores it in a platform-dependent way.
   *
   * This function is invoked by the scope after the scope is configured.
   * This should be done for custom context management in the backend.
   *
   * @param scope The scope to store.
   */
  storeScope(scope: ScopeInterface): void;

  /**
   * Returns the transport that is used by the backend.
   * Please note that the transport gets lazy initialized so it will only be there once the first event has been sent.
   *
   * @returns The transport.
   */
  getTransport(): Transport;
}
