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
  private sdks: Sdk.Interface[] = [];
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

  async install() {
    return await Promise.all(this.sdks.map((Sdk: Sdk.Interface) => Sdk._install()));
  }

  async send(event: Event) {
    return await Promise.all(this.sdks.map((Sdk: Sdk.Interface) => Sdk._send(event)));
  }
}
