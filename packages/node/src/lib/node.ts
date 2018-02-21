import {
  Adapter,
  Breadcrumb,
  Client,
  Context,
  SentryEvent,
  Options,
  User,
} from '@sentry/core';
declare function require(path: string): any;
const Raven = require('raven');

export interface NodeOptions extends Options {}

export class SentryNode implements Adapter {
  constructor(private client: Client, public options: NodeOptions = {}) {}

  public install(): Promise<boolean> {
    Raven.config(this.client.dsn.getDSN(true), this.options).install();
    return Promise.resolve(true);
  }

  public getRaven(): any {
    return Raven;
  }

  public captureException(exception: any): Promise<SentryEvent> {
    return new Promise<SentryEvent>((resolve, reject) => {
      const ravenSend = Raven.send;
      Raven.send = (data: any) => {
        Raven.send = ravenSend;
        resolve(data);
      };
      Raven.captureException(exception);
    });
  }

  public captureMessage(message: string): Promise<SentryEvent> {
    return new Promise<SentryEvent>((resolve, reject) => {
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

  public send(event: SentryEvent): Promise<void> {
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

  public setOptions(options: NodeOptions): Promise<void> {
    Object.assign(this.options, options);
    Object.assign(Raven, this.options);
    return Promise.resolve();
  }

  public getContext(): Promise<Context> {
    return Promise.resolve(Raven.getContext());
  }

  public setContext(context: Context): Promise<void> {
    Raven.setContext(context);
    return Promise.resolve();
  }
}
