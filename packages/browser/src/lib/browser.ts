import { Adapter, Breadcrumb, Client, Context, Event, Options, User } from '@sentry/core';
declare function require(path: string): any;
const Raven = require('raven-js');

export interface BrowserOptions extends Options {}

export class SentryBrowser implements Adapter {
  private client: Client;

  private captureException(exception: object | Error) {
    return new Promise<Event>((resolve, reject) => {
      const ravenSendRequest = Raven._sendProcessedPayload;
      Raven._sendProcessedPayload = (data: any) => {
        Raven._sendProcessedPayload = ravenSendRequest;
        resolve(data);
      };
      Raven.captureException(exception);
    });
  }

  private captureMessage(message: string | number) {
    return new Promise<Event>((resolve, reject) => {
      const ravenSendRequest = Raven._sendProcessedPayload;
      Raven._sendProcessedPayload = (data: any) => {
        Raven._sendProcessedPayload = ravenSendRequest;
        resolve(data);
      };
      Raven.captureMessage(message);
    });
  }

  private captureBreadcrumb(crumb: Breadcrumb) {
    return new Promise<Breadcrumb>((resolve, reject) => {
      Raven.captureBreadcrumb(crumb);
      resolve(crumb);
    });
  }

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

  public capture(event: Event) {
    switch (event.type) {
      case 'exception': {
        return this.captureException(event.payload);
      }

      case 'message': {
        return this.captureMessage(event.payload);
      }

      case 'breadcrumb': {
        return this.captureBreadcrumb(event.payload);
      }

      default: {
        const message = 'Incorrect Event type';
        return Promise.reject(message);
      }
    }
  }

  public send(event: any) {
    return new Promise<Event>((resolve, reject) => {
      Raven._sendProcessedPayload(event, (error: any) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(event);
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
