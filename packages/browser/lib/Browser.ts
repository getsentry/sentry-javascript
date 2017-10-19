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
  private client: Client;

  constructor(client: Client, public options: Browser.Options = {}) {
    this.client = client;
    return this;
  }

  install(): Promise<boolean> {
    // TODO: check for raven this._globalOptions.allowSecretKey
    Raven.config(this.client.dsn.getDsn(false), this.options).install();
    return Promise.resolve(true);
  }

  setOptions(options: Browser.Options) {
    Object.assign(this.options, options);
    Object.assign(Raven._globalOptions, this.options);
    return this;
  }

  captureException(exception: Error) {
    let ravenSendRequest = Raven._sendProcessedPayload;
    return new Promise<Event>((resolve, reject) => {
      Raven._sendProcessedPayload = (data: any) => {
        resolve(data);
        Raven._sendProcessedPayload = ravenSendRequest;
      };
      Raven.captureException(exception);
    });
  }

  captureMessage(message: string) {
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
    return new Promise<Event>((resolve, reject) => {
      Raven._sendProcessedPayload(event, (error: any) => {
        // TODO: error handling
        resolve(event);
      });
    });
  }
}
