import { Breadcrumb, SentryEvent } from '@sentry/core';
import * as RavenJS from 'raven-js';

/** Provides access to internal raven functionality. */
export interface RavenInternal {
  captureBreadcrumb(breadcrumb: Breadcrumb): void;
  captureException(exception: any): void;
  captureMessage(message: string): void;
  config(dsn: string, options: object): RavenInternal;
  install(): void;
  _sendProcessedPayload(event: SentryEvent, cb: (err: any) => void): void;
  setBreadcrumbCallback(cb: (b: Breadcrumb) => Breadcrumb | boolean): void;
  wrap(options: object, fn: Function): Function;
}

/** Casted raven instance with access to internal functions. */
export const Raven: RavenInternal = RavenJS as any;
