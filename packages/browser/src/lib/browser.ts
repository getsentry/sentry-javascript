import {
  Adapter,
  Breadcrumb,
  Client,
  Context,
  SentryEvent,
  Options,
  User,
} from '@sentry/core';

import * as RavenJS from 'raven-js';
const Raven = RavenJS as any;

export interface BrowserOptions extends Options {}

export class SentryBrowser implements Adapter {
  constructor(private client: Client, public options: BrowserOptions = {}) {}

  public install() {
    Raven.config(this.client.dsn.getDSN(), this.options).install();
    return Promise.resolve(true);
  }

  public getRaven() {
    return Raven;
  }

  public captureException(exception: any): Promise<SentryEvent> {
    return new Promise<SentryEvent>((resolve, reject) => {
      const ravenSendRequest = Raven._sendProcessedPayload;
      Raven._sendProcessedPayload = (data: any) => {
        Raven._sendProcessedPayload = ravenSendRequest;
        resolve(data);
      };
      Raven.captureException(exception);
    });
  }

  public captureMessage(message: string): Promise<SentryEvent> {
    return new Promise<SentryEvent>((resolve, reject) => {
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

  public send(event: SentryEvent): Promise<void> {
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

  public wrap(fn: Function, options: object): Function {
    return Raven.wrap(options, fn);
  }

  public setOptions(options: BrowserOptions): Promise<void> {
    Object.assign(this.options, options);
    Object.assign(Raven._globalOptions, this.options);
    return Promise.resolve();
  }

  public async getContext(): Promise<Context> {
    return Promise.resolve(Raven.getContext());
  }

  public setContext(context: Context): Promise<void> {
    if (context.extra) {
      Raven.setExtraContext(context.extra);
    }
    if (context.user) {
      Raven.setUserContext(context.user);
    }
    if (context.tags) {
      Raven.setTagsContext(context.tags);
    }
    return Promise.resolve();
  }
}
