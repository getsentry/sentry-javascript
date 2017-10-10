import { Event } from '../Core/Interface/Event';
import { Sdk } from '../Core/Sdk';
import { Core, Options } from '../Core/Core';
import * as RavenJs from 'raven-js';

export class JavaScript implements Sdk.Interface {
  readonly dsn: string;
  readonly options: Options = {};
  private core: Core;

  constructor(dsn: string, options: Options, core: Core) {
    this.dsn = dsn;
    this.options = options;
    this.core = core;
    return this;
  }

  async _install(): Promise<Sdk.Result<boolean>> {
    RavenJs.config(this.dsn).install();
    return Promise.resolve({
      sdk: this,
      value: true
    });
  }

  async _send(event: Event) {
    return new Promise<Sdk.Result<Event>>((resolve, reject) => {
      RavenJs.captureMessage(event.message);
      setTimeout(() => {
        resolve({
          sdk: this,
          value: event
        });
      }, 1000);
    });
  }
}
