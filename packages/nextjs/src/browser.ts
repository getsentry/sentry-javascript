import * as SentryBrowser from '@sentry/browser';

import { NextjsOptions } from './options';

/** */
export function init(options: NextjsOptions): any {
  SentryBrowser.init(options);
}

export * from '@sentry/minimal';
