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

  public getContext() {
    // TODO: check for cyclic objects
    return JSON.parse(JSON.stringify(this._context));
  }

  public getAdapter<A extends Adapter.IAdapter>(): A {
    if (!this._adapter) {
      throw new SentryError('No adapter in use, please call .use(<Adapter>)');
    }
    return this._adapter as A;
  }

  /**
   * Register a Adapter on the Core
   * @param adapter
   * @param options
   */
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

  public async captureException(exception: Error) {
    return this.send(await this.getAdapter().captureException(exception));
  }

  public async captureMessage(message: string) {
    return this.send(await this.getAdapter().captureMessage(message));
  }

  public async captureBreadcrumb(crumb: IBreadcrumb) {
    return this.getAdapter().captureBreadcrumb(crumb);
  }

  public async install() {
    await this.getAdapter().install();
    return this;
  }

  public async send(event: Event) {
    return this.getAdapter().send(event);
  }

  // ---------------- HELPER

  public log(...args: any[]) {
    if (this.options.logLevel >= LogLevel.Debug) {
      // tslint:disable-next-line
      console.log(...args);
    }
  }

  // -----------------------

  // ---------------- CONTEXT

  public async setUserContext(user?: IUser) {
    Context.set(this._context, 'user', user);
    // TODO: Remove this once we moved code away from adapters
    const adapter = this.getAdapter();
    if (adapter.setUserContext) {
      adapter.setUserContext(user);
    }
    // -------------------------------------------------------
    return this;
  }

  public async setTagsContext(tags?: { [key: string]: any }) {
    Context.mergeIn(this._context, 'tags', tags);
    // TODO: Remove this once we moved code away from adapters
    const adapter = this.getAdapter();
    if (adapter.setTagsContext) {
      adapter.setTagsContext(tags);
    }
    // -------------------------------------------------------
    return this;
  }

  public async setExtraContext(extra?: { [key: string]: any }) {
    Context.mergeIn(this._context, 'extra', extra);
    // TODO: Remove this once we moved code away from adapters
    const adapter = this.getAdapter();
    if (adapter.setExtraContext) {
      adapter.setExtraContext(extra);
    }
    // -------------------------------------------------------
    return this;
  }

  public async clearContext() {
    this._context = Context.getDefaultContext();
    // TODO: Remove this once we moved code away from adapters
    const adapter = this.getAdapter();
    if (adapter.clearContext) {
      adapter.clearContext();
    }
    // -------------------------------------------------------
    return this;
  }

  // ------------------------
}
