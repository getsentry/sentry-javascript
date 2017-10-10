import { Event } from '../Core/Interface/Event';
import { Sdk } from '../Core/Sdk';
import { Core, Options } from '../Core/Core';
import * as RavenNode from 'raven';

// Temporary demo implementation
export class Node implements Sdk.Interface {
  readonly dsn: string;
  readonly options: Options;
  readonly core: Core;

  constructor(dsn: string, options: Options, core: Core) {
    this.dsn = dsn;
    this.options = options;
    this.core = core;
    this.options = options;
    return this;
  }

  async _install() {
    RavenNode.config(this.dsn).install();
    return Promise.resolve({
      sdk: this
    });
  }
  async _send(event: Event) {
    return new Promise<Sdk.Result<Event>>((resolve, reject) => {
      RavenNode.captureMessage(event.message, () => {
        resolve({
          sdk: this,
          value: event
        });
      });
    });
  }
  getProcess(): string {
    return RavenNode.generateEventId();
  }
}
