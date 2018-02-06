import {Adapter, Breadcrumb, Context as ContextInterface, Event, Options, User, LogLevel} from './interfaces';
import {SentryError} from './sentry';

import {DSN} from './dsn';
import {Context} from './context';

export class Client {
  public readonly dsn: DSN;
  public options: Options;
  private adapter: Adapter;
  private context: Context;
  private isInstalled: Promise<boolean>;

  constructor(
    dsn: string,
    options: Options = {
      logLevel: LogLevel.Error,
      maxBreadcrumbs: 100,
    },
  ) {
    this.dsn = new DSN(dsn);
    this.context = new Context();
    return this;
  }

  private awaitAdapter(): Promise<Adapter> {
    const adapter = this.getAdapter();
    if (!this.isInstalled) {
      throw new SentryError('Please call install() before calling other methods on Sentry');
    }
    return this.isInstalled.then(() => this.adapter);
  }

  private async send(event: Event) {
    const adapter = await this.awaitAdapter();
    return adapter.send(event);
  }

  public getAdapter<Adapter>() {
    if (!this.adapter) {
      throw new SentryError('No adapter in use, please call .use(<Adapter>)');
    }
    return this.adapter;
  }

  public use<A extends Adapter, O extends {}>(adapter: {new (client: Client, options?: O): A}, options?: O): Client {
    if (this.adapter) {
      // TODO: implement unregister
      throw new RangeError('There is already a Adapter registered, call unregister() to remove current adapter');
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

  public async capture(event: Event) {
    const adapter = await this.awaitAdapter();
    return adapter.capture(event);
  }

  public async setOptions(options: Options) {
    const adapter = await this.awaitAdapter();
    return adapter.setOptions(options);
  }

  // ---------------- CONTEXT

  // TODO: Migrate context to core, using Context interface

  public async getContext() {
    // TODO: check for cyclic objects
    const adapter = await this.awaitAdapter();
    const context = await adapter.getContext();
    return JSON.parse(JSON.stringify(context));
  }

  public async setContext(context: ContextInterface) {
    const adapter = await this.awaitAdapter();
    return this.adapter.setContext(context);
  }

  // ---------------- HELPER

  public log(...args: any[]) {
    if (this.options && this.options.logLevel && this.options.logLevel >= LogLevel.Debug) {
      // tslint:disable-next-line
      console.log(...args);
    }
  }
}
