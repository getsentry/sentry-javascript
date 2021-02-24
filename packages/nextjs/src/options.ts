import { BrowserOptions } from '@sentry/browser';
// import { NodeOptions } from '@sentry/node';
import { Options } from '@sentry/types';

export interface NextjsOptions extends Options, BrowserOptions /** , NodeOptions */ {
  // TODO: options for NextJS
}
