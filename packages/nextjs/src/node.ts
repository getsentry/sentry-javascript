import * as SentryNode from '@sentry/node';

import { NextjsOptions } from './options';

/** */
export function init(options: NextjsOptions): any {
  SentryNode.init(options);
}
