import {Event} from './Interfaces';
import {DSN} from './Interfaces/DSN';
import {Adapter} from './Adapter';
import {Options} from './Options';
import {SentryError} from './Sentry';

// TODO: Add breadcrumbs
// TODO: Add context handling tags, extra, user
export class Client {
  private _adapter: Adapter;
  readonly dsn: DSN;

  constructor(dsn: string, public options: Options = {maxBreadcrumbs: 100}) {
    this.dsn = new DSN(dsn);
    return this;
  }

  private get adapter() {
    if (!this._adapter) {
      throw new SentryError('No adapter in use, please call .use(<Adapter>)');
    }
    return this._adapter;
  }

  getAdapter<A extends Adapter>(): A {
    return this.adapter as A;
  }

  /**
   * Register a Adapter on the Core
   * @param Adapter
   * @param options
   */
  use<A extends Adapter, O extends Adapter.Options>(
    Adapter: {new (client: Client, options?: O): A},
    options?: O
  ): Client {
    if (this._adapter) {
      // TODO: implement unregister
      throw new RangeError(
        'There is already a Adapter registered, call unregister() to remove current adapter'
      );
    }
    this._adapter = new Adapter(this, options);
    return this;
  }

  async captureException(exception: Error) {
    return this.send(await this.adapter.captureException(exception));
  }

  async captureMessage(message: string) {
    return this.send(await this.adapter.captureMessage(message));
  }

  install() {
    return this.adapter.install();
  }

  send(event: Event) {
    return this.adapter.send(event);
  }
}
