import { Event } from './Interface/Event';
import { Sdk } from './Sdk';

export enum Severity {
  Fatal,
  Error,
  Warning,
  Info,
  Debug,
  Critical
}

export enum LogLevel {
  None,
  Error,
  Debug,
  Verbose
}

export type Options = { [key: string]: any };

export class Core {
  private sdks = new Array<Sdk.Interface>();
  readonly dsn: string;
  readonly options: Options = {};

  constructor(dsn: string, options?: Options) {
    this.dsn = dsn;
    this.options = options;
    return this;
  }

  register<T extends Sdk.Interface>(
    client: { new (dsn: string, options: Options, core: Core): T },
    options?: Options
  ): T {
    let sdk = new client(this.dsn, options, this);
    this.sdks.push(sdk);
    return sdk;
  }

  getInstalledSdks(): Sdk.Interface[] {
    return this.sdks;
  }

  captureMessage(message: string) {
    let event = new Event();
    event.message = message;
    return this.captureEvent(event);
  }

  captureEvent(event: Event) {
    return this.sdks.reduce(
      async (event, sdk) => sdk.captureEvent(await event),
      Promise.resolve(event)
    );
  }

  install() {
    return Promise.all(this.sdks.map(sdk => sdk.install()));
  }

  send(event: Event) {
    return Promise.all(this.sdks.map(sdk => sdk.send(event)));
  }
}
