import { Breadcrumb, SentryEvent } from '@sentry/types';
// tslint:disable-next-line:no-implicit-dependencies
import * as RavenJS from 'raven-js';

/** Signature for the Raven send function */
export type SendMethod = (event: SentryEvent, cb: (err: any) => void) => void;

/** Provides access to internal raven functionality. */
export interface RavenInternal {
  captureBreadcrumb(breadcrumb: Breadcrumb): void;
  captureException(exception: any): void;
  captureMessage(message: string): void;
  config(dsn: string, options: object): RavenInternal;
  install(): void;
  setBreadcrumbCallback(cb: (b: Breadcrumb) => Breadcrumb | boolean): void;
  // tslint:disable-next-line:ban-types
  wrap(options: object, fn: Function): Function;
  _sendProcessedPayload: SendMethod;
  VERSION: string;
}

/** Casted raven instance with access to internal functions. */
// tslint:disable-next-line:variable-name
export const Raven = (((RavenJS || {}) as any).default ||
  (RavenJS as any)) as RavenInternal;
