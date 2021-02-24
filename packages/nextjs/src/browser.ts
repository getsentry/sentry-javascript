import { init as browserInit } from '@sentry/browser';

import { NextjsOptions } from './options';

/** Inits the Sentry NextJS SDK on the browser. */
export function init(options: NextjsOptions): any {
  browserInit(options);
}

export * from '@sentry/minimal';
