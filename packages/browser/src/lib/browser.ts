import {
  Adapter,
  Breadcrumb,
  Client,
  Context,
  Event,
  Options,
  User,
} from '@sentry/core';
declare function require(path: string): any;
const Raven = require('raven-js');

export interface BrowserOptions extends Options {}

export class SentryBrowser implements Adapter {
  private client: Client;

  constructor(client: Client, public options: BrowserOptions = {}) {
    this.client = client;
  }

  public install() {
    Raven.config(this.client.dsn.getDSN(), this.options).install();
    return Promise.resolve(true);
  }

  public getRaven() {
    return Raven;
  }

  public captureException(exception: any): Promise<Event> {
    return new Promise<Event>((resolve, reject) => {
      const ravenSendRequest = Raven._sendProcessedPayload;
      Raven._sendProcessedPayload = (data: any) => {
        Raven._sendProcessedPayload = ravenSendRequest;
        resolve(data);
      };
      Raven.captureException(exception);
    });
  }

  public captureMessage(message: string): Promise<Event> {
    return new Promise<Event>((resolve, reject) => {
      const ravenSendRequest = Raven._sendProcessedPayload;
      Raven._sendProcessedPayload = (data: any) => {
        Raven._sendProcessedPayload = ravenSendRequest;
        resolve(data);
      };
      Raven.captureMessage(message);
    });
  }

  public captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb> {
    return new Promise<Breadcrumb>((resolve, reject) => {
      Raven.captureBreadcrumb(breadcrumb);
      resolve(breadcrumb);
    });
  }

  public send(event: Event): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Raven._sendProcessedPayload(event, (error: any) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  public wrap(fn: Function, options: object) {
    return Raven.wrap(options, fn);
  }

  public async setOptions(options: BrowserOptions) {
    Object.assign(this.options, options);
    Object.assign(Raven._globalOptions, this.options);
    return this;
  }

  public async getContext() {
    const context = Raven.getContext();
    return Promise.resolve(context);
  }

  public async setContext(context: Context) {
    if (context.extra) {
      Raven.setExtraContext(context.extra);
    }
    if (context.user) {
      Raven.setUserContext(context.user);
    }
    if (context.tags) {
      Raven.setTagsContext(context.tags);
    }
    return Promise.resolve(this);
  }
}
