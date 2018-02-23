import {
  Adapter,
  Breadcrumb,
  Context,
  LogLevel,
  Options,
  SentryEvent,
  User,
} from './interfaces';
import { SentryError } from './sentry';

import ContextManager from './context';
import DSN from './dsn';

export default class Client {
  public readonly dsn: DSN;
  public options: Options;
  private adapter: Adapter;
  private context: ContextManager;
  private isInstalled: Promise<boolean>;

  /**
   * Create a new instance of Sentry.Client.
   *
   * @param  {string} dsn
   * @param  {Options={logLevel:LogLevel.Error} options
   * @param  {100}} maxBreadcrumbs
   */
  constructor(
    dsn: string,
    options: Options = { logLevel: LogLevel.Error, maxBreadcrumbs: 100 },
  ) {
    this.dsn = new DSN(dsn);
    this.options = options;
    this.context = new ContextManager();
    return this;
  }

  /**
   * Returns an instance of the used adapter
   *
   * @returns A
   */
  public getAdapter<A extends Adapter>(): A {
    if (!this.adapter) {
      throw new SentryError('No adapter in use, please call .use(<Adapter>)');
    }
    return this.adapter as A;
  }

  /**
   * This will tell the {Client} to use the adapter internally.
   * The {Client} will delegate all calls to the {Adapter}.
   * Please note that there must be one and only one {Adapter} used at any time.
   *
   * @param  {{new(client:Client} adapter
   * @param  {O} options?
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
   * Call install on the used {Adapter}
   *
   * @returns Promise<this>
   */
  public install(): Promise<this> {
    if (!this.isInstalled) {
      this.isInstalled = this.getAdapter().install();
    }
    return this.isInstalled.then(() => this);
  }

  /**
   * Capture an exception and send it to Sentry.
   *
   * @param  {any} exception
   * @returns Promise
   */
  public async captureException(exception: any): Promise<SentryEvent> {
    const adapter = await this.awaitAdapter();
    const event = await adapter.captureException(exception);
    return this.send(event);
  }

  /**
   * Capture a message and send it to Sentry.
   *
   * @param  {string} message
   * @returns Promise
   */
  public async captureMessage(message: string): Promise<SentryEvent> {
    const adapter = await this.awaitAdapter();
    const event = await adapter.captureMessage(message);
    return this.send(event);
  }

  /**
   * Capture a breadcrumb.
   * Breadcrumbs will be added to the next event that will be sent to Sentry.
   *
   * @param  {Breadcrumb} crumb
   * @returns Promise
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
   * This function is responsible to delegate the actual sending of the event to the used {Adapter}.
   * It should not be necessary to call this function directly, please use
   * {captureException} or {captureMessage} respectively.
   *
   * @param  {SentryEvent} event
   * @returns Promise
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
   * Set new options on the fly.
   *
   * @param  {Options} options
   * @returns Promise<Adapter>
   */
  public async setOptions(options: Options): Promise<Adapter> {
    const adapter = await this.awaitAdapter();
    await adapter.setOptions(options);
    return adapter;
  }

  /**
   * Returns the current {Context}.
   *
   * @returns Promise<Context>
   */
  public async getContext(): Promise<Context> {
    // TODO: Migrate context to core, using Context interface
    // TODO: check for cyclic objects
    const adapter = await this.awaitAdapter();
    const context = await adapter.getContext();
    return JSON.parse(JSON.stringify(context));
  }

  /**
   * Merge the context into the current content.
   *
   * @param  {ContextInterface} context
   * @returns Promise<Adapter>
   */
  public async setContext(context: Context): Promise<Adapter> {
    const adapter = await this.awaitAdapter();
    await adapter.setContext(context);
    return adapter;
  }

  /**
   * Internal log function, if LogLevel >= Debug it will console.log.
   *
   * @param  {any[]} ...args
   */
  public log(...args: any[]) {
    if (
      this.options &&
      this.options.logLevel &&
      this.options.logLevel >= LogLevel.Debug
    ) {
      // tslint:disable-next-line
      console.log(...args);
    }
  }

  /**
   * Internal function to make sure a adapter is "used" an installed
   *
   * @returns Promise<Adapter>
   */
  private awaitAdapter(): Promise<Adapter> {
    const adapter = this.getAdapter();
    if (!this.isInstalled) {
      throw new SentryError(
        'Please call install() before calling other methods on Sentry',
      );
    }
    return this.isInstalled.then(() => this.adapter);
  }
}
