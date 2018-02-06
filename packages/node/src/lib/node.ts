import {Adapter, Breadcrumb, Client, Context as ContextInterface, Event, Options, User} from '@sentry/core';
declare function require(path: string): any;
const Raven = require('raven');

export interface NodeOptions extends Options {}

export class SentryNode implements Adapter {
  private client: Client;

  private captureException(exception: object | Error) {
    return new Promise<Event>((resolve, reject) => {
      const ravenSend = Raven.send;
      Raven.send = (data: any) => {
        Raven.send = ravenSend;
        resolve(data);
      };
      Raven.captureException(exception);
    });
  }

  private captureMessage(message: string | number) {
    return new Promise<Event>((resolve, reject) => {
      const ravenSend = Raven.send;
      Raven.send = (data: any) => {
        Raven.send = ravenSend;
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

  constructor(client: Client, public options: NodeOptions = {}) {
    this.client = client;
  }

  public install() {
    Raven.config(this.client.dsn.getDsn(false), this.options).install();
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
        console.log(message);
        return Promise.reject(message);
      }
    }
  }

  public send(event: any) {
    return new Promise<Event>((resolve, reject) => {
      Raven.send(event, (error: any) => {
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

  public async setOptions(options: NodeOptions) {
    Object.assign(this.options, options);
    Object.assign(Raven, this.options);
    return this;
  }

  public async getContext() {
    const context = Raven.getContext();
    return Promise.resolve(context);
  }

  public async setContext(context: ContextInterface) {
    Raven.setContext(context);
    return Promise.resolve(this);
  }
}
