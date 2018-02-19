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
const Raven = require('raven');

export interface NodeOptions extends Options {}

export class SentryNode implements Adapter {
  private client: Client;

  constructor(client: Client, public options: NodeOptions = {}) {
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
      const ravenSend = Raven.send;
      Raven.send = (data: any) => {
        Raven.send = ravenSend;
        resolve(data);
      };
      Raven.captureException(exception);
    });
  }

  public captureMessage(message: string): Promise<Event> {
    return new Promise<Event>((resolve, reject) => {
      const ravenSend = Raven.send;
      Raven.send = (data: any) => {
        Raven.send = ravenSend;
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
      Raven.send(event, (error: any) => {
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

  public async setOptions(options: NodeOptions) {
    Object.assign(this.options, options);
    Object.assign(Raven, this.options);
    return this;
  }

  public async getContext() {
    const context = Raven.getContext();
    return Promise.resolve(context);
  }

  public async setContext(context: Context) {
    Raven.setContext(context);
    return Promise.resolve(this);
  }
}
