/// <reference types="node" />
import { Adapter, Core, Options, Event } from '@sentry/core';
var Raven = require('raven-js');

export namespace Browser {
  export type Options = Adapter.Options & {
    testOption?: boolean;
  };
}

export class Browser implements Adapter {
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

  install(): Promise<Adapter.Result<boolean>> {
    Raven.config(this.dsn, this.options).install();
    return Promise.resolve({
      sdk: this,
      value: true
    });
  }

  captureException(exception: Error, event: Event) {
    let ravenSendRequest = Raven._sendProcessedPayload;
    return new Promise<Event>((resolve, reject) => {
      Raven._sendProcessedPayload = (data: any) => {
        resolve(data);
        Raven._sendProcessedPayload = ravenSendRequest;
      };
      Raven.captureException(exception);
    });
  }

  captureEvent(event: any): Promise<Event> {
    let ravenSendRequest = Raven._sendProcessedPayload;
    return new Promise<Event>((resolve, reject) => {
      Raven._sendProcessedPayload = (data: any) => {
        resolve(data);
        Raven._sendProcessedPayload = ravenSendRequest;
      };
      Raven.captureMessage(event.message);
    });
  }

  send(event: any) {
    return new Promise<Adapter.Result<Event>>((resolve, reject) => {
      Raven._sendProcessedPayload(event, (error: any) => {
        resolve({
          sdk: this,
          value: event
        });
      });
    });
  }
}
