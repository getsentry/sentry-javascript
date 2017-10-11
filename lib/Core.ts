import { Event } from './Interface';
import { Sdk } from './Sdk';

export type Options = {
  maxBreadcrumbs: number;
};

export class Core {
  private _sdks = new Array<Sdk.Interface>();
  readonly dsn: string;
  readonly options: Options = {
    maxBreadcrumbs: 100
  };

  constructor(dsn: string, options?: Options) {
    this.dsn = dsn;
    this.options = options;
    return this;
  }

  register<T extends Sdk.Interface, U extends Sdk.Options>(
    client: { new (dsn: string, options: U, core: Core): T },
    options?: U
  ): T {
    console.log(options);
    let sdk = new client(this.dsn, options, this);
    this._sdks.push(sdk);
    if (!this.hasUniqueRankedSdks()) {
      throw new TypeError('SDK must have unique rank, use options {rank: value}');
    }
    // We want to sort all SDKs by rank
    this._sdks.sort((prev, current) => {
      if (prev.options.rank < current.options.rank) return -1;
      if (prev.options.rank > current.options.rank) return 1;
      return 0;
    });
    return sdk;
  }

  get sdks() {
    return this._sdks;
  }

  captureMessage(message: string) {
    let event = new Event();
    event.message = message;
    return this.captureEvent(event);
  }

  async captureEvent(event: Event) {
    return this.send(
      await this._sdks.reduce(
        async (event, sdk) => sdk.captureEvent(await event),
        Promise.resolve(event)
      )
    );
  }

  install() {
    this.checkHasConfiguredSdk();
    return Promise.all(this._sdks.map(sdk => sdk.install()));
  }

  /**
   * This will send an event with the SDK with the lowest rank
   * @param event
   */
  send(event: Event) {
    this.checkHasConfiguredSdk();
    return this._sdks[0].send(event);
  }

  // -------------------- HELPER

  private hasUniqueRankedSdks() {
    return new Set(this._sdks.map(sdk => sdk.options.rank)).size === this._sdks.length;
  }

  private checkHasConfiguredSdk() {
    if (this.sdks.length === 0)
      throw new RangeError('At least one SDK has to be registered');
  }
}
