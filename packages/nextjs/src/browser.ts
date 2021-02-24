import * as SentryBrowser from '@sentry/browser';

import { NextjsOptions } from './options';

/** Inits the Sentry NextJS SDK on the browser. */
export function init(options: NextjsOptions): any {
  SentryBrowser.init(options);
}

export * from '@sentry/minimal';
