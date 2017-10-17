import { Event } from './Interfaces';
import { DSN } from './Interfaces/DSN';
import { Adapter } from './Adapter';
import { Options } from './Options';

// TODO: Add breadcrumbs
// TODO: Add context handling tags, extra, user
export class Client {
  private _adapters = new Array<Adapter>();
  readonly dsn: DSN;

  /**
   * Returns all registered Adapters
   */
  get adapters() {
    this.hasConfiguredAdapter();
    return this._adapters;
  }

  constructor(dsn: string, public options: Options = { maxBreadcrumbs: 100 }) {
    this.dsn = new DSN(dsn);
    return this;
  }

  /**
   * Register a Adapter on the Core
   * @param Adapter
   * @param options
   */
  register<T extends Adapter, O extends Adapter.Options>(
    Adapter: { new (core: Client, options?: O): T },
    options?: O
  ): T {
    let adapter = new Adapter(this, options);
    // We use this._adapters on purpose here
    // everywhere else we should use this.adapters
    this._adapters.push(adapter);
    if (!this.hasUniqueRankedAdapters()) {
      throw new TypeError('Adapter must have unique rank, use options {rank: value}');
    }
    this.sortAdapters();
    return adapter;
  }

  async captureException(exception: Error) {
    return this.send(
      await this.adapters.reduce(
        async (event, adapter) => adapter.captureException(exception, await event),
        Promise.resolve(new Event())
      )
    );
  }

  captureMessage(message: string) {
    let event = new Event();
    event.message = message;
    return this.captureEvent(event);
  }

  /**
   * Captures and sends an event. Will pass through every registered
   * Adapter and send will be called by the Adapter with the lowest rank
   * @param event
   */
  async captureEvent(event: any) {
    return this.send(
      await this.adapters.reduce(
        async (event, adapter) => adapter.captureEvent(await event),
        Promise.resolve(event)
      )
    );
  }

  /**
   * Calls install() on all registered Adapters
   */
  install() {
    return Promise.all(this.adapters.map(adapter => adapter.install()));
  }

  /**
   * This will send an event with the Adapter with the lowest rank
   * @param event
   */
  send(event: Event) {
    return this.adapters[0].send(event);
  }

  // -------------------- HELPER

  /**
   * This sorts all Adapters from lowest to highest rank
   */
  private sortAdapters() {
    this._adapters.sort((prev, current) => {
      if (prev.options.rank < current.options.rank) return -1;
      if (prev.options.rank > current.options.rank) return 1;
      return 0;
    });
  }

  /**
   * Checks if there are multiple Adapters with the same rank
   */
  private hasUniqueRankedAdapters() {
    let ranks = this.adapters.map(integration => integration.options.rank);
    return (
      ranks.filter(rank => ranks.indexOf(rank) === ranks.lastIndexOf(rank)).length ===
      this.adapters.length
    );
  }

  /**
   * Checks if there are any registered Adapters, this will be called by
   * this.adapter
   */
  private hasConfiguredAdapter() {
    if (this._adapters.length === 0)
      throw new RangeError('At least one Adapter has to be registered');
  }
}
