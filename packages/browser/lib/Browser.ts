/// <reference types="node" />
import { Integration, Core, Options, Event } from '@sentry/core';
var Raven = require('raven-js');

export namespace Browser {
  export type Options = Integration.Options & {
    testOption?: boolean;
  };
}

export class Browser implements Integration {
  options: Browser.Options = {
    rank: 1000,
    testOption: false
  };
  private core: Core;

  constructor(core: Core, public dsn: string, options?: Browser.Options) {
    this.core = core;
    if (options && options.rank) this.options.rank = options.rank;
    return this;
  }

  install(): Promise<Integration.Result<boolean>> {
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
    return new Promise<Integration.Result<Event>>((resolve, reject) => {
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
