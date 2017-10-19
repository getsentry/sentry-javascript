/// <reference types="node" />
import {Adapter, Client, Options, Event} from '@sentry/core';
var Raven = require('raven-js');

export namespace Browser {
  export type Options = Adapter.Options & {
    allowSecretKey?: boolean;
    allowDuplicates?: boolean;
  };
}

export class Browser implements Adapter {
  options: Browser.Options = {
    rank: 1000
  };
  private client: Client;

  constructor(client: Client, options?: Browser.Options) {
    this.client = client;
    if (options && options.rank) this.options.rank = options.rank;
    return this;
  }

  install(): Promise<Adapter.Result<boolean>> {
    // TODO: check for raven this._globalOptions.allowSecretKey
    Raven.config(this.client.dsn.getDsn(false), this.options).install();
    return Promise.resolve({
      adapter: this,
      value: true
    });
  }

  setOptions(options: Browser.Options) {
    Object.assign(this.options, options);
    Object.assign(Raven._globalOptions, this.options);
    return this;
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

  captureMessage(message: string, event: Event): Promise<Event> {
    let ravenSendRequest = Raven._sendProcessedPayload;
    return new Promise<Event>((resolve, reject) => {
      Raven._sendProcessedPayload = (data: any) => {
        resolve(data);
        Raven._sendProcessedPayload = ravenSendRequest;
      };
      Raven.captureMessage(message);
    });
  }

  send(event: any) {
    return new Promise<Adapter.Result<Event>>((resolve, reject) => {
      Raven._sendProcessedPayload(event, (error: any) => {
        // TODO: error handling
        resolve({
          adapter: this,
          value: event
        });
      });
    });
  }
}
