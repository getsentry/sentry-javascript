import * as Adapter from './Adapter';
import { Event, IBreadcrumb, IUser, LogLevel } from './Interfaces';
import * as Context from './Interfaces/Context';
import { DSN } from './Interfaces/DSN';
import { IOptions } from './Options';
import { SentryError } from './Sentry';

export class Client {
  public readonly dsn: DSN;
  private _adapter: Adapter.IAdapter;
  private _context: Context.IContext;
  private _isInstalled: Promise<boolean>;

  constructor(
    dsn: string,
    public options: IOptions = {
      logLevel: LogLevel.Error,
      maxBreadcrumbs: 100,
    }
  ) {
    this.dsn = new DSN(dsn);
    this._context = Context.getDefaultContext();
    return this;
  }

  public getAdapter<A extends Adapter.IAdapter>(): A {
    if (!this._adapter) {
      throw new SentryError('No adapter in use, please call .use(<Adapter>)');
    }
    return this._adapter as A;
  }

  public use<A extends Adapter.IAdapter, O extends {}>(
    adapter: { new (client: Client, options?: O): A },
    options?: O
  ): Client {
    if (this._adapter) {
      // TODO: implement unregister
      throw new RangeError(
        'There is already a Adapter registered, call unregister() to remove current adapter'
      );
    }
    this._adapter = new adapter(this, options);
    return this;
  }

  public install(): Promise<this> {
    if (!this._isInstalled) {
      this._isInstalled = this.getAdapter().install();
    }
    return this._isInstalled.then(() => this);
  }

  public async captureException(exception: Error) {
    const adapter = await this.awaitAdapter();
    return this.send(await adapter.captureException(exception));
  }

  public async captureMessage(message: string) {
    const adapter = await this.awaitAdapter();
    return this.send(await adapter.captureMessage(message));
  }

  public async captureBreadcrumb(crumb: IBreadcrumb) {
    const adapter = await this.awaitAdapter();
    return adapter.captureBreadcrumb(crumb);
  }

  public async send(event: Event) {
    const adapter = await this.awaitAdapter();
    return adapter.send(event);
  }

  // ---------------- HELPER

  public log(...args: any[]) {
    if (this.options.logLevel >= LogLevel.Debug) {
      // tslint:disable-next-line
      console.log(...args);
    }
  }

  // -----------------------

  public async setRelease(release: string) {
    const adapter = await this.awaitAdapter();
    await adapter.setRelease(release);
    return this;
  }

  // ---------------- CONTEXT

  public getContext() {
    // TODO: check for cyclic objects
    return JSON.parse(JSON.stringify(this._context));
  }

  public async setUserContext(user?: IUser) {
    Context.set(this._context, 'user', user);
    const adapter = await this.awaitAdapter();
    await adapter.setUserContext(user);
    return this;
  }

  public async setTagsContext(tags?: { [key: string]: any }) {
    Context.mergeIn(this._context, 'tags', tags);
    const adapter = await this.awaitAdapter();
    await adapter.setTagsContext(tags);
    return this;
  }

  public async setExtraContext(extra?: { [key: string]: any }) {
    Context.mergeIn(this._context, 'extra', extra);
    const adapter = await this.awaitAdapter();
    await adapter.setExtraContext(extra);
    return this;
  }

  public async clearContext() {
    this._context = Context.getDefaultContext();
    const adapter = await this.awaitAdapter();
    await adapter.clearContext();
    return this;
  }

  // ------------------------

  private awaitAdapter(): Promise<Adapter.IAdapter> {
    const adapter = this.getAdapter();
    if (!this._isInstalled) {
      throw new SentryError(
        'Please call install() before calling other methods on Sentry'
      );
    }
    return this._isInstalled.then(() => this._adapter);
  }
}
