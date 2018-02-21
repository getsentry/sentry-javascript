import {
  Adapter,
  Breadcrumb,
  Context as ContextInterface,
  Event,
  Options,
  User,
  LogLevel,
} from './interfaces';
import { SentryError } from './sentry';

import { DSN } from './dsn';
import { Context } from './context';

export class Client {
  public readonly dsn: DSN;
  public options: Options;
  private adapter: Adapter;
  private context: Context;
  private isInstalled: Promise<boolean>;

  constructor(
    dsn: string,
    options: Options = { logLevel: LogLevel.Error, maxBreadcrumbs: 100 },
  ) {
    this.dsn = new DSN(dsn);
    this.options = options;
    this.context = new Context();
    return this;
  }

  private awaitAdapter(): Promise<Adapter> {
    const adapter = this.getAdapter();
    if (!this.isInstalled) {
      throw new SentryError(
        'Please call install() before calling other methods on Sentry',
      );
    }
    return this.isInstalled.then(() => this.adapter);
  }

  public getAdapter<A extends Adapter>(): A {
    if (!this.adapter) {
      throw new SentryError('No adapter in use, please call .use(<Adapter>)');
    }
    return this.adapter as A;
  }

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

  public install(): Promise<this> {
    if (!this.isInstalled) {
      this.isInstalled = this.getAdapter().install();
    }
    return this.isInstalled.then(() => this);
  }

  public async captureException(exception: any): Promise<Event> {
    const adapter = await this.awaitAdapter();
    return this.send(await adapter.captureException(exception));
  }

  public async captureMessage(message: string): Promise<Event> {
    const adapter = await this.awaitAdapter();
    return this.send(await adapter.captureMessage(message));
  }

  public async captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb> {
    const adapter = await this.awaitAdapter();
    return adapter.captureBreadcrumb(breadcrumb);
  }

  public async send(event: Event): Promise<Event> {
    const adapter = await this.awaitAdapter();
    await adapter.send(event);
    return event;
  }

  public async setOptions(options: Options): Promise<Adapter> {
    const adapter = await this.awaitAdapter();
    await adapter.setOptions(options);
    return adapter;
  }

  // TODO: Migrate context to core, using Context interface
  public async getContext(): Promise<Context> {
    // TODO: check for cyclic objects
    const adapter = await this.awaitAdapter();
    const context = await adapter.getContext();
    return JSON.parse(JSON.stringify(context));
  }

  public async setContext(context: ContextInterface): Promise<Adapter> {
    const adapter = await this.awaitAdapter();
    await adapter.setContext(context);
    return adapter;
  }

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
}
