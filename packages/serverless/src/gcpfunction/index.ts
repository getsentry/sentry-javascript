import * as Sentry from '@sentry/node';

import { serverlessEventProcessor } from '../utils';

export * from './http';
export * from './events';
export * from './cloud_events';

/**
 * @see {@link Sentry.init}
 */
export function init(options: Sentry.NodeOptions = {}): void {
  Sentry.init(options);
  Sentry.addGlobalEventProcessor(serverlessEventProcessor('GCPFunction'));
}
