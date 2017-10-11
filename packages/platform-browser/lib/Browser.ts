import { Sdk, Core, Options, Event } from '@sentry/core';
var Raven = require('raven-js');

export namespace Browser {
  export type Options = Sdk.Options & {
    testOption?: boolean;
  };

  export class Client implements Sdk.Interface {
    readonly dsn: string;
    readonly options: Options = {};
    private core: Core;

    constructor(dsn: string, options: Options, core: Core) {
      this.dsn = dsn;
      this.options = options;
      this.core = core;
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
