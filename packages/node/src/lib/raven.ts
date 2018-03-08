import { Breadcrumb, SentryEvent } from '@sentry/core';
import * as RavenNode from 'raven';

/** Provides access to internal raven functionality. */
export interface RavenInternal {
  captureBreadcrumb(breadcrumb: Breadcrumb): void;
  captureException(exception: any): void;
  captureMessage(message: string): void;
  config(dsn: string, options: object): RavenInternal;
  install(): void;
  send(event: SentryEvent, cb: (err: any) => void): void;
}

/** Casted raven instance with access to internal functions. */
// tslint:disable-next-line:variable-name
export const Raven: RavenInternal = RavenNode as any;
