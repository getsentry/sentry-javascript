import { Breadcrumb, Context, Scope, SentryEvent } from './domain';
import { DSN } from './dsn';
import { SendStatus } from './status';

/**
 * TODO
 */
export interface Scope {
  breadcrumbs: Breadcrumb[];
  context: Context;
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

/**
 * Base configuration options for every SDK.
 * Specific SDKs can add more options.
 */
export interface Options {
  /**
   * Specifies whether this SDK should activate and send events to Sentry.
   * Disabling the SDK reduces all overhead from instrumentation, collecting
   * breadcrumbs and capturing events.
   * Defaults to true.
   */
  enabled?: boolean;

  /**
   * The DSN used to connect to Sentry and identify the project.
   * If omitted, the SDK will not send any data to Sentry.
   */
  dsn?: string;

  /**
   * The release identifier used when uploading respective source maps.
   * Specify this value to allow Sentry to resolve the correct source maps when
   * processing events.
   */
  release?: string;

  /** The current environment of your application (e.g. "production"). */
  environment?: string;

  /** The maximum number of breadcrumbs sent with events. Defaults to 100. */
  maxBreadcrumbs?: number;

  /** Console logging verbosity for the SDK Client. */
  logLevel?: LogLevel;

  /**
   * A callback invoked during event submission, allowing to cancel the
   * process. If unspecified, all events will be sent to Sentry.
   *
   * This function is called for both error and message events before all other
   * callbacks. Note that the SDK might perform other actions after calling
   * this function. Use {@link Options.beforeSend} for notifications on events
   * instead.
   *
   * @param event The error or message event generated by the SDK.
   * @returns True if the event should be sent, false otherwise.
   */
  shouldSend?(event: SentryEvent): boolean;

  /**
   * A callback invoked during event submission, allowing to optionally modify
   * the event before it is sent to Sentry.
   *
   * This function is called after {@link Options.shouldSend} and just before
   * sending the event and must return synchronously.
   *
   * Note that you must return a valid event from this callback. If you do not
   * wish to modify the event, simply return it at the end. To cancel event
   * submission instead, use {@link Options.shouldSend}.
   *
   * @param event The error or message event generated by the SDK.
   * @returns A new event that will be sent.
   */
  beforeSend?(event: SentryEvent): SentryEvent;

  /**
   * A callback invoked after event submission has completed.
   * @param event The error or message event sent to Sentry.
   */
  afterSend?(event: SentryEvent, status: SendStatus): void;

  /**
   * A callback allowing to skip breadcrumbs.
   *
   * This function is called for both manual and automatic breadcrumbs before
   * all other callbacks. Note that the SDK might perform other actions after
   * calling this function. Use {@link Options.beforeBreadcrumb} for
   * notifications on breadcrumbs instead.
   *
   * @param breadcrumb The breadcrumb as created by the SDK.
   * @returns True if the breadcrumb should be added, false otherwise.
   */
  shouldAddBreadcrumb?(breadcrumb: Breadcrumb): boolean;

  /**
   * A callback invoked when adding a breadcrumb, allowing to optionally modify
   * it before adding it to future events.
   *
   * This function is called after {@link Options.shouldAddBreadcrumb} and just
   * before persisting the breadcrumb. It must return synchronously.
   *
   * Note that you must return a valid breadcrumb from this callback. If you do
   * not wish to modify the breadcrumb, simply return it at the end. To skip a
   * breadcrumb instead, use {@link Options.shouldAddBreadcrumb}.
   *
   * @param breadcrumb The breadcrumb as created by the SDK.
   * @returns The breadcrumb that will be added.
   */
  beforeBreadcrumb?(breadcrumb: Breadcrumb): Breadcrumb;

  /**
   * A callback invoked after adding a breadcrumb.
   * @param breadcrumb The breadcrumb as created by the SDK.
   */
  afterBreadcrumb?(breadcrumb: Breadcrumb): void;
}

/**
 * User-Facing Sentry SDK Client Frontend.
 *
 * This interface contains all methods to interface with the SDK once it has
 * been installed. It allows to send events to Sentry, record breadcrumbs and
 * set a context included in every event. Since the SDK mutates its environment,
 * there will only be one instance during runtime. To retrieve that instance,
 * use {@link Client.getInstance}.
 *
 * Note that the call to {@link Frontend.install} should occur as early as
 * possible so that even errors during startup can be recorded reliably:
 *
 * @example
 * import { SentryClient } from '@sentry/node';
 * SentryClient.create({ dsn: '__DSN__' });
 *
 * @example
 * import { SentryClient } from '@sentry/node';
 * SentryClient.captureMessage('Custom message');
 */
export interface Frontend<O extends Options = Options> {
  /**
   * Installs the SDK if it hasn't been installed already.
   *
   * Since this performs modifications in the environment, such as instrumenting
   * library functionality or adding signal handlers, this method should only
   * be called once.
   *
   * The installation is performed asynchronously. While it is possible to use
   * the SDK before the installation has finished, it is advised to wait until
   * the returned Promise has resolved before issuing methods such as
   * {@link Frontend.captureException} or {@link Frontend.captureBreadcrumb}.
   *
   * @returns If the installation was the successful or not.
   */
  install(): boolean;

  /**
   * Captures an exception event and sends it to Sentry.
   *
   * @param exception An exception-like object.
   * TODO
   * @returns The created event id.
   */
  captureException(exception: any, scope: Scope): Promise<void>;

  /**
   * Captures a message event and sends it to Sentry.
   *
   * @param message The message to send to Sentry.
   * TODO
   * @returns The created event id.
   */
  captureMessage(message: string, scope: Scope): Promise<void>;

  /**
   * Captures a manually created event and sends it to Sentry.
   *
   * @param event The event to send to Sentry.
   * TODO
   * @returns The created event id.
   */
  captureEvent(event: SentryEvent, scope: Scope): Promise<void>;

  /**
   * Records a new breadcrumb which will be attached to future events.
   *
   * Breadcrumbs will be added to subsequent events to provide more context on
   * user's actions prior to an error or crash. To configure the maximum number
   * of breadcrumbs, use {@link Options.maxBreadcrumbs}.
   *
   * @param breadcrumb The breadcrumb to record.
   * TODO
   */
  addBreadcrumb(breadcrumb: Breadcrumb, scope: Scope): void;

  /** Returns the current DSN. */
  getDSN(): DSN | undefined;

  /** Returns the current options. */
  getOptions(): O;

  /**
   * Updates context information (user, tags, extras) for future events.
   *
   * @param context A partial context object to merge into current context.
   * TODO
   */
  setContext(context: Context, scope: Scope): void;

  /** Returns the inital scope for the shim. */
  getInitialScope(): Scope;
}

/**
 * Internal platform-dependent Sentry SDK Backend.
 *
 * While {@link Frontend} contains business logic specific to an SDK, the
 * Backend offers platform specific implementations for low-level operations.
 * These are persisting and loading information, sending events, and hooking
 * into the environment.
 *
 * Backends receive a handle to the Frontend in their constructor. When a
 * Backend automatically generates events or breadcrumbs, it must pass them to
 * the Frontend for validation and processing first.
 *
 * Usually, the Frontend will be of corresponding type, e.g. NodeBackend
 * receives NodeFrontend. However, higher-level SDKs can choose to instanciate
 * multiple Backends and delegate tasks between them. In this case, an event
 * generated by one backend might very well be sent by another one.
 *
 * The frontend also provides access to options via {@link Frontend.getOptions}
 * and context via {@link Frontend.getContext}. Note that the user might update
 * these any time and they should not be cached.
 */
export interface Backend {
  /** Installs the SDK into the environment. */
  install(): boolean;

  /** Creates a {@link SentryEvent} from an exception. */
  eventFromException(exception: any, scope: Scope): Promise<SentryEvent>;

  /** Creates a {@link SentryEvent} from a plain message. */
  eventFromMessage(message: string, scope: Scope): Promise<SentryEvent>;

  /** Submits the event to Sentry */
  sendEvent(event: SentryEvent): Promise<number>;
}
