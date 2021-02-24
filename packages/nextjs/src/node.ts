import * as SentryNode from '@sentry/node';

import { NextjsOptions } from './options';

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NextjsOptions): any {
  SentryNode.init(options);
}

export * from '@sentry/minimal';
