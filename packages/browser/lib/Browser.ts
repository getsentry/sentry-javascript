/// <reference types="node" />
import { Sdk, Core, Options, Event } from '@sentry/core';
var Raven = require('raven-js');

export namespace Browser {
  export type Options = Sdk.Options & {
    testOption?: boolean;
  };

  export class Client implements Sdk.Interface {
    options: Options = {
      rank: 1000,
      testOption: false
    };
    private core: Core;

    constructor(core: Core, public dsn: string, options?: Options) {
      this.core = core;
      if (options && options.rank) this.options.rank = options.rank;
      return this;
    }

    install(): Promise<Sdk.Result<boolean>> {
      Raven.config(this.dsn).install();
      return Promise.resolve({
        sdk: this,
        value: true
      });
    }

    captureEvent(event: Event): Promise<Event> {
      Raven.captureMessage(event.message);
      return Promise.resolve(event);
    }

    send(event: Event) {
      return new Promise<Sdk.Result<Event>>((resolve, reject) => {
        Raven.captureMessage(event.message);
        setTimeout(() => {
          resolve({
            sdk: this,
            value: event
          });
        }, 1000);
      });
    }
  }
}
