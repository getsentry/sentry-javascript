import { Breadcrumb, Context, SentryEvent } from './domain';
import { DSN } from './dsn';
import { SentryError } from './error';

/** TODO */
export enum LogLevel {
  None = 0,
  Error = 1,
  Debug = 2,
  Verbose = 3,
}

/** TODO */
export interface Options {
  environment?: string;
  logLevel?: LogLevel;
  maxBreadcrumbs?: number;
  ignoreErrors?: Array<string | RegExp>;
  ignoreUrls?: Array<string | RegExp>;
  whitelistUrls?: Array<string | RegExp>;
  includePaths?: Array<string | RegExp>;
  release?: string;
  beforeSend?(e: SentryEvent): SentryEvent;
  shouldSend?(e: SentryEvent): boolean;
  afterSend?(e: SentryEvent): void;
  shouldAddBreadcrumb?(b: Breadcrumb): boolean;
  beforeBreadcrumb?(b: Breadcrumb): Breadcrumb;
  afterBreadcrumb?(b: Breadcrumb): Breadcrumb;
}

/** TODO */
export interface Adapter {
  readonly options: {};
  install(): Promise<boolean>;
  captureException(exception: any): Promise<SentryEvent>;
  captureMessage(message: string): Promise<SentryEvent>;
  captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb>;
  send(event: SentryEvent): Promise<void>;
  setOptions(options: Options): Promise<void>;
  getContext(): Promise<Context>;
  setContext(context: Context): Promise<void>;
}

/** Default options used for the Client. */
const DEFAULT_OPTIONS = { logLevel: LogLevel.Error, maxBreadcrumbs: 100 };

/**
 * Sentry SDK Client.
 *
 * This class contains all methods to interface with the SDK once it has been
 * installed. It allows to send events to Sentry, record breadcrumbs and set a
 * context included in every event. Since the SDK mutates its environment, there
 * will only be one instance during runtime. To retrieve that instance, use
 * {@link Sentry.getSharedClient}.
 *
 * Note that the call to {@link Sentry.install} should occur as early as
 * possible so that even errors during startup can be recorded reliably:
 *
 * @example
 * const Sentry = require('@sentry/core');
 * const { SentryNode } = require('@sentry/node');
 *
 * const options = {
 *   // Add SDK-specific options here
 * };
 *
 * Sentry.create(__DSN__)
 *   .use(SentryNode, options)
 *   .install();
 *
 * @example
 * const Sentry = require('@sentry/core');
 *
 * // SDK must be installed at this point
 * const client = Sentry.getSharedClient();
 * client.captureMessage('Custom message');
 */
export class Client {
  /** The DSN configured during installation. */
  public readonly dsn: DSN;
  /** Generic client options. */
  public options: Options;
  /** The adapter created with {@link Client.use} */
  private adapter?: Adapter;
  /** A promise that resolves during installation. */
  private isInstalled?: Promise<boolean>;

  /**
   * Create a new instance of {@link Client}.
   *
   * @param dsn The DSN used to connect to and authenticate with Sentry.
   * @param options Configuration options for the client.
   */
  public constructor(dsn: string, options: Options = DEFAULT_OPTIONS) {
    this.dsn = new DSN(dsn);
    this.options = options;
    return this;
  }

  /**
   * Returns an instance of the used adapter casted to its inner type.
   */
  public getAdapter<A extends Adapter>(): A {
    if (!this.adapter) {
      throw new SentryError('No adapter in use, please call .use(<Adapter>)');
    }

    return this.adapter as A;
  }

  /**
   * This will tell the {@link Client} to use the adapter internally.
   *
   * The {@link Client} will delegate all calls to the {@link Adapter}. Please
   * note that there must be one and only one {@link Adapter} used at any time.
   *
   * @param adapter
   * @param options
   * @returns Client
   */
  public use<A extends Adapter, O extends {}>(
    adapter: { new (client: Client, options?: O): A },
    options?: O,
  ): Client {
    if (this.adapter) {
      // TODO: implement unregister
      throw new RangeError(
        'There is already a Adapter registered, call unregister() to remove current adapter',
      );
    }
    this.adapter = new adapter(this, options);
    return this;
  }

  /**
   * Installs the configured {@link Adapter}.
   * @returns A promise that resolves when installation has finished.
   */
  public async install(): Promise<this> {
    if (!this.isInstalled) {
      this.isInstalled = this.getAdapter().install();
    }

    await this.isInstalled;
    return this;
  }

  /**
   * Capture an exception and send it to Sentry.
   *
   * @param exception An exception-like object.
   * @returns A promise that resolves when the exception has been sent.
   */
  public async captureException(exception: any): Promise<SentryEvent> {
    const adapter = await this.awaitAdapter();
    const event = await adapter.captureException(exception);
    return this.send(event);
  }

  /**
   * Capture a message and send it to Sentry.
   *
   * @param message The message to send to Sentry.
   * @returns A promise that resolves when the message has been sent.
   */
  public async captureMessage(message: string): Promise<SentryEvent> {
    const adapter = await this.awaitAdapter();
    const event = await adapter.captureMessage(message);
    return this.send(event);
  }

  /**
   * Adds a new breadcrumb.
   *
   * Breadcrumbs will be added to subsequent events to provide more context on
   * user's actions prior to an error or crash. To configure the maximum number
   * of breadcrumbs, use {@link Options.maxBreadcrumbs}.
   *
   * @param crumb The breadcrumb to record.
   * @returns A promise that resolves when the breadcrumb has been persisted.
   */
  public async captureBreadcrumb(crumb: Breadcrumb): Promise<Breadcrumb> {
    const {
      shouldAddBreadcrumb,
      beforeBreadcrumb,
      afterBreadcrumb,
    } = this.options;

    if (!shouldAddBreadcrumb || shouldAddBreadcrumb(crumb)) {
      const finalCrumb = beforeBreadcrumb ? beforeBreadcrumb(crumb) : crumb;
      const adapter = await this.awaitAdapter();
      await adapter.captureBreadcrumb(finalCrumb);
      if (afterBreadcrumb) {
        afterBreadcrumb(finalCrumb);
      }
    }

    return crumb;
  }

  /**
   * Sends an event to Sentry by delegating to the internal {@link Adapter}.
   *
   * It should not be necessary to call this function directly, instead use
   * {@link captureException} or {@link captureMessage}. The client will process
   * the respective data, create an event with metadata and then send it to
   * Sentry.
   *
   * Before sending, this function invokes the configured "beforeSend" hook,
   * which allows to modify the event.
   *
   * @param event A processed event.
   * @returns A promise that resolves once the event has been sent.
   */
  public async send(event: SentryEvent): Promise<SentryEvent> {
    const { shouldSend, beforeSend, afterSend } = this.options;
    if (shouldSend && !shouldSend(event)) {
      return event;
    }

    const finalEvent = beforeSend ? beforeSend(event) : event;
    const adapter = await this.awaitAdapter();
    await adapter.send(finalEvent);
    if (afterSend) {
      afterSend(finalEvent);
    }
    return finalEvent;
  }

  /**
   * Set new options on the fly (not supported by every SDK).
   *
   * @param options New options to replace the previous ones.
   * @returns A promise that resolves when the options have been updated.
   */
  public async setOptions(options: Options): Promise<Adapter> {
    const adapter = await this.awaitAdapter();
    await adapter.setOptions(options);
    return adapter;
  }

  /**
   * Resolves the current {@link Context}.
   * @returns A promise that resolves when the context is ready.
   */
  public async getContext(): Promise<Context> {
    // TODO: Migrate context to core, using Context interface
    // TODO: check for cyclic objects
    const adapter = await this.awaitAdapter();
    const context = await adapter.getContext();
    return JSON.parse(JSON.stringify(context)) as Context;
  }

  /**
   * Merge new context information into the current content.
   *
   * @param data New context data.
   * @returns A promise that resolves when the context has been updated.
   */
  public async setContext(data: Context): Promise<Adapter> {
    const adapter = await this.awaitAdapter();
    await adapter.setContext(data);
    return adapter;
  }

  /**
   * Logs debugging information if {@link LogLevel} is set to Debug or Verbose.
   *
   * @param args Arguments to log to the console
   */
  public log(...args: any[]): void {
    if (
      this.options &&
      this.options.logLevel &&
      this.options.logLevel >= LogLevel.Debug
    ) {
      // tslint:disable-next-line:no-console
      console.log(...args);
    }
  }

  /**
   * Asynchronously resolves the adapter.
   *
   * This function may be called during installation and will bock until
   * installation has finished.
   *
   * If installation has not started or no adapter has been configured, an
   * exception will be thrown.
   *
   * @returns A promise that resolves to the {@link Adapter}.
   */
  private async awaitAdapter(): Promise<Adapter> {
    if (!this.isInstalled) {
      throw new SentryError(
        'SDK not installed. Please call install() before using the SDK',
      );
    }

    await this.isInstalled;
    return this.getAdapter();
  }
}
