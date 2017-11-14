/// <reference types="node" />
import { Adapter, Breadcrumb, Client, Event, Options, User } from '@sentry/core';
const Raven = require('raven-js');

export interface IBrowserOptions {
  allowSecretKey?: boolean;
  allowDuplicates?: boolean;
}

export class Browser implements Adapter {
  private client: Client;

  constructor(client: Client, public options: IBrowserOptions = {}) {
    this.client = client;
    return this;
  }

  public install(): Promise<boolean> {
    // TODO: check for raven this._globalOptions.allowSecretKey
    Raven.config(this.client.dsn.getDsn(false), this.options).install();
    return Promise.resolve(true);
  }

  public setOptions(options: IBrowserOptions) {
    Object.assign(this.options, options);
    Object.assign(Raven._globalOptions, this.options);
    return this;
  }

  public captureException(exception: Error) {
    const ravenSendRequest = Raven._sendProcessedPayload;
    return new Promise<Event>((resolve, reject) => {
      Raven._sendProcessedPayload = (data: any) => {
        resolve(data);
        Raven._sendProcessedPayload = ravenSendRequest;
      };
      Raven.captureException(exception);
    });
  }

  public captureMessage(message: string) {
    const ravenSendRequest = Raven._sendProcessedPayload;
    return new Promise<Event>((resolve, reject) => {
      Raven._sendProcessedPayload = (data: any) => {
        resolve(data);
        Raven._sendProcessedPayload = ravenSendRequest;
      };
      Raven.captureMessage(message);
    });
  }

  public setBreadcrumbCallback(callback: (crumb: Breadcrumb) => void) {
    Raven.setBreadcrumbCallback(callback);
  }

  public captureBreadcrumb(crumb: Breadcrumb) {
    return new Promise<Breadcrumb>((resolve, reject) => {
      // TODO: We have to check if this is necessary used in react-native
      // let oldCaptureBreadcrumb = Raven.captureBreadcrumb;
      // Raven.captureBreadcrumb = (breadCrumb: any, ...args: any[]) => {
      //   if (breadCrumb.data && typeof breadCrumb.data === 'object') {
      //     breadCrumb.data = Object.assign({}, breadCrumb.data);
      //   }
      //   return oldCaptureBreadcrumb(breadCrumb, ...args);
      // };
      Raven.captureBreadcrumb(crumb);
      resolve(crumb);
    });
  }

  public send(event: any) {
    return new Promise<Event>((resolve, reject) => {
      Raven._sendProcessedPayload(event, (error: any) => {
        // TODO: error handling
        resolve(event);
      });
    });
  }

  public setUserContext(user?: User) {
    Raven.setUserContext(user);
    return this;
  }

  public setTagsContext(tags?: { [key: string]: any }) {
    Raven.setTagsContext(tags);
    return this;
  }

  public setExtraContext(extra?: { [key: string]: any }) {
    Raven.setExtraContext(extra);
    return this;
  }

  public clearContext() {
    Raven.clearContext();
    return this;
  }
}
