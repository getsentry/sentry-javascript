import * as Adapter from './Adapter';
import { Event, IBreadcrumb, IUser, LogLevel } from './Interfaces';
import * as Context from './Interfaces/Context';
import { DSN } from './Interfaces/DSN';
import { IOptions } from './Options';
import { SentryError } from './Sentry';

// TODO: Add breadcrumbs
// TODO: Add context handling tags, extra, user
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

  private get adapter() {
    if (!this._adapter) {
      throw new SentryError('No adapter in use, please call .use(<Adapter>)');
    }
    return this._adapter;
  }

  public getAdapter<A extends Adapter.IAdapter>(): A {
    return this.adapter as A;
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
    return this.send(await this.adapter.captureException(exception));
  }

  public async captureMessage(message: string) {
    return this.send(await this.adapter.captureMessage(message));
  }

  public captureBreadcrumb(crumb: IBreadcrumb) {
    return this.adapter.captureBreadcrumb(crumb);
  }

  public install() {
    return this.adapter.install();
  }

  public send(event: Event) {
    return this.adapter.send(event);
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

  public setUserContext(user?: IUser) {
    Context.set(this._context, 'user', user);
    // TODO: Remove this once we moved code away from adapters
    if (this.adapter.setUserContext) {
      this.adapter.setUserContext(user);
    }
    // -------------------------------------------------------
    return this;
  }

  public setTagsContext(tags?: { [key: string]: any }) {
    Context.mergeIn(this._context, 'tags', tags);
    // TODO: Remove this once we moved code away from adapters
    if (this.adapter.setTagsContext) {
      this.adapter.setTagsContext(tags);
    }
    // -------------------------------------------------------
    return this;
  }

  public setExtraContext(extra?: { [key: string]: any }) {
    Context.mergeIn(this._context, 'extra', extra);
    // TODO: Remove this once we moved code away from adapters
    if (this.adapter.setExtraContext) {
      this.adapter.setExtraContext(extra);
    }
    // -------------------------------------------------------
    return this;
  }

  public clearContext() {
    this._context = Context.getDefaultContext();
    // TODO: Remove this once we moved code away from adapters
    if (this.adapter.clearContext) {
      this.adapter.clearContext();
    }
    // -------------------------------------------------------
    return this;
  }

  // ------------------------
}
