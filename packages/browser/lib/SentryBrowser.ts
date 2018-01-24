import { Client, Event, IAdapter, IBreadcrumb, IUser } from '@sentry/core';
declare function require(path: string): any;
const Raven = require('raven-js');

export interface ISentryBrowserOptions {
  allowSecretKey?: boolean;
  allowDuplicates?: boolean;
}

export class SentryBrowser implements IAdapter {
  private client: Client;

  constructor(client: Client, public options: ISentryBrowserOptions = {}) {
    this.client = client;
  }

  public install(): Promise<boolean> {
    Raven.config(this.client.dsn.getDsn(false), this.options).install();
    return Promise.resolve(true);
  }

  public getRaven() {
    return Raven;
  }

  public async setOptions(options: ISentryBrowserOptions) {
    Object.assign(this.options, options);
    Object.assign(Raven._globalOptions, this.options);
    return this;
  }

  public captureException(exception: Error) {
    return new Promise<Event>((resolve, reject) => {
      const ravenSendRequest = Raven._sendProcessedPayload;
      Raven._sendProcessedPayload = (data: any) => {
        Raven._sendProcessedPayload = ravenSendRequest;
        resolve(data);
      };
      Raven.captureException(exception);
    });
  }

  public captureMessage(message: string) {
    return new Promise<Event>((resolve, reject) => {
      const ravenSendRequest = Raven._sendProcessedPayload;
      Raven._sendProcessedPayload = (data: any) => {
        Raven._sendProcessedPayload = ravenSendRequest;
        resolve(data);
      };
      Raven.captureMessage(message);
    });
  }

  public setBreadcrumbCallback(callback: (crumb: IBreadcrumb) => void) {
    Raven.setBreadcrumbCallback(callback);
  }

  public captureBreadcrumb(crumb: IBreadcrumb) {
    return new Promise<IBreadcrumb>((resolve, reject) => {
      Raven.captureBreadcrumb(crumb);
      resolve(crumb);
    });
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

  public async setUserContext(user?: IUser) {
    Raven.setUserContext(user);
    return this;
  }

  public async setTagsContext(tags?: { [key: string]: any }) {
    Raven.setTagsContext(tags);
    return this;
  }

  public async setExtraContext(extra?: { [key: string]: any }) {
    Raven.setExtraContext(extra);
    return this;
  }

  public async clearContext() {
    Raven.clearContext();
    return this;
  }

  public async setRelease(release: string) {
    Raven.setRelease(release);
    return this;
  }
}
