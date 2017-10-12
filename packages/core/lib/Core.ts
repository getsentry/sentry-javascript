import { Event } from './Interfaces';
import { Integration } from './Integration';

export type Options = {
  maxBreadcrumbs: number;
};

// TODO: Add breadcrumbs
// TODO: Add context handling tags, extra, user
export class Core {
  private _integrations = new Array<Integration>();
  /**
   * Returns all registered SDKs
   */
  get integrations() {
    this.hasConfiguredSdk();
    return this._integrations;
  }

  constructor(public dsn: string, public options: Options = { maxBreadcrumbs: 100 }) {
    // TODO: parse DSN split into public/private
    return this;
  }

  /**
   * Register a Integration on the Core
   * @param Integration
   * @param options
   */
  register<T extends Integration, O extends Integration.Options>(
    Integration: { new (core: Core, dsn: string, options?: O): T },
    options?: O
  ): T {
    let integration = new Integration(this, this.dsn, options);
    // We use this._sdks on purpose here
    // everywhere else we should use this.sdks
    this._integrations.push(integration);
    if (!this.hasUniqueRankedSdks()) {
      throw new TypeError('SDK must have unique rank, use options {rank: value}');
    }
    this.sortSdks();
    return integration;
  }

  captureMessage(message: string) {
    let event = new Event();
    event.message = message;
    return this.captureEvent(event);
  }

  /**
   * Captures and sends an event. Will pass through every registered
   * SDK and send will be called by the SDK with the lowest rank
   * @param event
   */
  async captureEvent(event: Event) {
    return this.send(
      await this.integrations.reduce(
        async (event, sdk) => sdk.captureEvent(await event),
        Promise.resolve(event)
      )
    );
  }

  /**
   * Calls install() on all registered SDKs
   */
  install() {
    return Promise.all(this.integrations.map(sdk => sdk.install()));
  }

  /**
   * This will send an event with the SDK with the lowest rank
   * @param event
   */
  send(event: Event) {
    return this.integrations[0].send(event);
  }

  // -------------------- HELPER

  /**
   * This sorts all SDKs from lowest to highest rank
   */
  private sortSdks() {
    this._integrations.sort((prev, current) => {
      if (prev.options.rank < current.options.rank) return -1;
      if (prev.options.rank > current.options.rank) return 1;
      return 0;
    });
  }

  /**
   * Checks if there are multiple SDKs with the same rank
   */
  private hasUniqueRankedSdks() {
    let ranks = this.integrations.map(integration => integration.options.rank);
    return (
      ranks.filter(rank => ranks.indexOf(rank) === ranks.lastIndexOf(rank)).length ===
      this.integrations.length
    );
  }

  /**
   * Checks if there are any registered SDKs, this will be called by
   * this.sdks
   */
  private hasConfiguredSdk() {
    if (this._integrations.length === 0)
      throw new RangeError('At least one SDK has to be registered');
  }
}
