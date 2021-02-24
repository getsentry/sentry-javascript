import { init as nodeInit } from '@sentry/node';

import { NextjsOptions } from './options';

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NextjsOptions): any {
  nodeInit(options);
}

export * from '@sentry/minimal';
